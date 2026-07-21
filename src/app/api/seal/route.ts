import { NextRequest, NextResponse } from 'next/server';
import { normalizeCategoryId } from '@/lib/categories';
import { sha256Hex, sign, type SealedFacts } from '@/lib/seal';
import { saveAlbum, storeMode, type Album, type Item, type ItemBytes, type MediaKind } from '@/lib/store';
import { extFromMime, newCode } from '@/lib/util';

export const runtime = 'nodejs';

const MAX_ITEMS = 20;
const MAX_TOTAL_BYTES = 200 * 1024 * 1024; // 200MB / album
const ALLOWED = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function POST(req: NextRequest) {
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

  const code = newCode();
  const sealedAt = new Date().toISOString();
  const items: Item[] = [];
  const bytesList: ItemBytes[] = [];
  let total = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const mimeType = (file.type || 'application/octet-stream').split(';')[0].trim();
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ error: `Định dạng chưa hỗ trợ: ${mimeType}.` }, { status: 415 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    total += bytes.length;
    if (total > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'Tổng dung lượng vượt 200MB.' }, { status: 413 });
    }

    const id = `i${i}`;
    const sha256 = sha256Hex(bytes);
    const kind: MediaKind = mimeType.startsWith('video/') ? 'video' : 'photo';
    const facts: SealedFacts = { code, itemId: id, sha256, sizeBytes: bytes.length, mimeType, sealedAt };

    // Ký có thể văng nếu thiếu khoá trong env (production). Bắt tại đây để trả
    // thông báo cấu hình rõ ràng thay vì 500 trắng.
    let signed: { signatureB64: string; keyId: string };
    try {
      signed = sign(facts);
    } catch (e) {
      console.error('[api/seal] ký thất bại:', e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Không ký được bằng chứng.' },
        { status: 500 },
      );
    }

    items.push({ id, kind, mimeType, ext: extFromMime(mimeType), sizeBytes: bytes.length, sha256, signatureB64: signed.signatureB64, keyId: signed.keyId });
    bytesList.push({ id, bytes });
  }

  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const album: Album = {
    code,
    sealedAt,
    items,
    shopName: str('shopName') ?? 'Shop demo',
    sellerNote: str('note'),
    clientLocation: str('location'),
    // Không tin client: giá trị lạ -> 'khac'.
    categoryId: normalizeCategoryId(str('categoryId')),
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
