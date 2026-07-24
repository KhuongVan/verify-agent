import { NextRequest, NextResponse } from 'next/server';
import { normalizeCategoryId } from '@/lib/categories';
import { deleteObjects, getObject } from '@/lib/r2';
import { sha256Hex, sign, type SealedFacts } from '@/lib/seal';
import {
  saveAlbum,
  saveAlbumMeta,
  storeMode,
  type Album,
  type Item,
  type ItemBytes,
  type MediaKind,
} from '@/lib/store';
import { extFromMime, newCode } from '@/lib/util';

export const runtime = 'nodejs';

const MAX_ITEMS = 20;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024; // 100MB / album (khớp giới hạn hiển thị ở client)
const ALLOWED = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
]);
const CODE_RE = /^[0-9A-Z]{4}-[0-9A-Z]{4}$/;
const ID_RE = /^i\d{1,3}$/;

/** Băm + ký một mục -> Item. Ném lỗi nếu thiếu khoá ký (bắt ở caller). */
function sealItem(
  code: string,
  id: string,
  mimeType: string,
  bytes: Buffer,
  sealedAt: string,
): Item {
  const sha256 = sha256Hex(bytes);
  const kind: MediaKind = mimeType.startsWith('video/') ? 'video' : 'photo';
  const facts: SealedFacts = { code, itemId: id, sha256, sizeBytes: bytes.length, mimeType, sealedAt };
  const signed = sign(facts);
  return {
    id,
    kind,
    mimeType,
    ext: extFromMime(mimeType),
    sizeBytes: bytes.length,
    sha256,
    signatureB64: signed.signatureB64,
    keyId: signed.keyId,
  };
}

const str = (form: FormData, k: string) => {
  const v = form.get(k);
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
};

export async function POST(req: NextRequest) {
  // JSON = bytes đã nằm sẵn trên R2 (client PUT thẳng qua presigned URL); server chỉ
  // đọc lại để băm + ký. Multipart = đường cũ, bytes đi kèm request (dev/local, fallback).
  const ct = req.headers.get('content-type') ?? '';
  return ct.includes('application/json') ? sealFromR2(req) : sealFromMultipart(req);
}

/**
 * Đường R2-direct: client đã tải bytes lên R2 rồi, chỉ gửi metadata. Server ĐỌC
 * LẠI bytes từ R2 để tự băm + ký — client KHÔNG tự khai hash, nên dấu niêm phong
 * vẫn do server quyết (không tin client).
 */
async function sealFromR2(req: NextRequest): Promise<NextResponse> {
  let body: {
    code?: unknown;
    capturedAt?: unknown;
    shopName?: unknown;
    note?: unknown;
    location?: unknown;
    categoryId?: unknown;
    items?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: 'Mã không hợp lệ.' }, { status: 400 });
  }

  const reqItems = Array.isArray(body.items) ? (body.items as { id: string; mimeType: string }[]) : [];
  if (reqItems.length === 0) {
    return NextResponse.json({ error: 'Chưa có ảnh/video nào để gửi.' }, { status: 400 });
  }
  if (reqItems.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Tối đa ${MAX_ITEMS} mục mỗi lần gửi.` }, { status: 413 });
  }

  const sealedAt = new Date().toISOString();
  const items: Item[] = [];
  const keys: string[] = [];
  let total = 0;

  try {
    for (const it of reqItems) {
      const id = typeof it?.id === 'string' ? it.id : '';
      const mimeType = typeof it?.mimeType === 'string' ? it.mimeType.split(';')[0].trim() : '';
      if (!ID_RE.test(id)) {
        return NextResponse.json({ error: `Mã mục không hợp lệ: ${id}.` }, { status: 400 });
      }
      if (!ALLOWED.has(mimeType)) {
        return NextResponse.json({ error: `Định dạng chưa hỗ trợ: ${mimeType}.` }, { status: 415 });
      }
      const key = `${code}/${id}.${extFromMime(mimeType)}`;
      let bytes: Buffer;
      try {
        bytes = await getObject(key);
      } catch {
        return NextResponse.json(
          { error: 'Chưa nhận đủ file trên máy chủ. Thử lại giúp nhé.' },
          { status: 409 },
        );
      }
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) {
        await deleteObjects([...keys, key]);
        return NextResponse.json({ error: 'Tổng dung lượng vượt 100MB.' }, { status: 413 });
      }
      keys.push(key);
      items.push(sealItem(code, id, mimeType, bytes, sealedAt));
    }
  } catch (e) {
    console.error('[api/seal] ký thất bại:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Không ký được bằng chứng.' },
      { status: 500 },
    );
  }

  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const album: Album = {
    code,
    sealedAt,
    items,
    shopName: s(body.shopName) ?? 'Shop demo',
    sellerNote: s(body.note),
    clientLocation: s(body.location),
    categoryId: normalizeCategoryId(s(body.categoryId)),
  };

  try {
    await saveAlbumMeta(album);
  } catch (e) {
    console.error(`[api/seal] lưu metadata thất bại (driver=${storeMode()}):`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Lưu bằng chứng thất bại.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ code, url: `/v/${code}`, count: items.length }, { status: 201 });
}

/** Đường cũ: bytes đi kèm multipart (dev/local, hoặc fallback khi không có R2). */
async function sealFromMultipart(req: NextRequest): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ (cần multipart/form-data).' }, { status: 400 });
  }

  const files = form.getAll('media').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return NextResponse.json({ error: 'Chưa có ảnh/video nào để gửi.' }, { status: 400 });
  }
  if (files.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Tối đa ${MAX_ITEMS} mục mỗi lần gửi.` }, { status: 413 });
  }

  // Dùng lại mã đã đặt trước (client gửi lên) nếu có; không thì sinh mới (đường cũ).
  const reserved = form.get('code');
  const code = typeof reserved === 'string' && CODE_RE.test(reserved) ? reserved : newCode();
  const sealedAt = new Date().toISOString();
  const items: Item[] = [];
  const bytesList: ItemBytes[] = [];
  let total = 0;

  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const mimeType = (file.type || 'application/octet-stream').split(';')[0].trim();
      if (!ALLOWED.has(mimeType)) {
        return NextResponse.json({ error: `Định dạng chưa hỗ trợ: ${mimeType}.` }, { status: 415 });
      }
      const bytes = Buffer.from(await file.arrayBuffer());
      total += bytes.length;
      if (total > MAX_TOTAL_BYTES) {
        return NextResponse.json({ error: 'Tổng dung lượng vượt 100MB.' }, { status: 413 });
      }
      const id = `i${i}`;
      items.push(sealItem(code, id, mimeType, bytes, sealedAt));
      bytesList.push({ id, bytes });
    }
  } catch (e) {
    console.error('[api/seal] ký thất bại:', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Không ký được bằng chứng.' },
      { status: 500 },
    );
  }

  const album: Album = {
    code,
    sealedAt,
    items,
    shopName: str(form, 'shopName') ?? 'Shop demo',
    sellerNote: str(form, 'note'),
    clientLocation: str(form, 'location'),
    // Không tin client: giá trị lạ -> 'khac'.
    categoryId: normalizeCategoryId(str(form, 'categoryId')),
  };

  try {
    await saveAlbum(album, bytesList);
  } catch (e) {
    console.error(`[api/seal] lưu thất bại (driver=${storeMode()}):`, e);
    const hint =
      storeMode() === 'local'
        ? 'Máy chủ đang chạy chế độ lưu local (filesystem) — trên serverless không ghi được. Hãy cấu hình NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.'
        : e instanceof Error
          ? e.message
          : 'Lưu bằng chứng thất bại.';
    return NextResponse.json({ error: hint }, { status: 500 });
  }

  return NextResponse.json({ code, url: `/v/${code}`, count: items.length }, { status: 201 });
}
