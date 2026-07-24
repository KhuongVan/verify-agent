/**
 * /api/upload-url — cấp URL presigned để CLIENT tải media THẲNG lên R2.
 *
 * Vì sao: route handler trên Vercel giới hạn request body ~4.5MB. Video Full HD
 * (đặc biệt mp4/H.264 của iOS) vượt ngưỡng -> upload qua /api/seal bị chặn, lỗi
 * "mất kết nối". Cho client PUT thẳng lên R2 thì không dính giới hạn đó.
 *
 * Luồng: client gọi endpoint này với danh sách mục -> nhận URL từng mục -> PUT
 * file lên R2 -> gọi /api/seal (JSON metadata, không kèm bytes) để server đọc lại
 * từ R2, băm + ký + lưu metadata.
 *
 * Chế độ local (chưa cấu hình R2/Supabase) không có R2 -> trả { mode: 'local' } để
 * client lùi về đường cũ (gửi bytes qua /api/seal multipart).
 */

import { NextRequest, NextResponse } from 'next/server';
import { presignPut } from '@/lib/r2';
import { storeMode } from '@/lib/store';
import { extFromMime } from '@/lib/util';

export const runtime = 'nodejs';

const MAX_ITEMS = 20;
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

type ReqItem = { id: string; mimeType: string };

export async function POST(req: NextRequest) {
  // Không có R2 -> báo client dùng đường cũ (multipart qua /api/seal).
  if (storeMode() !== 'supabase') {
    return NextResponse.json({ mode: 'local' });
  }

  let body: { code?: unknown; items?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'JSON không hợp lệ.' }, { status: 400 });
  }

  const code = typeof body.code === 'string' ? body.code : '';
  if (!CODE_RE.test(code)) {
    return NextResponse.json({ error: 'Mã không hợp lệ.' }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? (body.items as ReqItem[]) : [];
  if (items.length === 0) {
    return NextResponse.json({ error: 'Thiếu danh sách mục.' }, { status: 400 });
  }
  if (items.length > MAX_ITEMS) {
    return NextResponse.json({ error: `Tối đa ${MAX_ITEMS} mục mỗi lần.` }, { status: 413 });
  }

  const uploads: { id: string; url: string }[] = [];
  for (const it of items) {
    const id = typeof it?.id === 'string' ? it.id : '';
    const mimeType = typeof it?.mimeType === 'string' ? it.mimeType.split(';')[0].trim() : '';
    if (!ID_RE.test(id)) {
      return NextResponse.json({ error: `Mã mục không hợp lệ: ${id}.` }, { status: 400 });
    }
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json({ error: `Định dạng chưa hỗ trợ: ${mimeType}.` }, { status: 415 });
    }
    const key = `${code}/${id}.${extFromMime(mimeType)}`;
    try {
      uploads.push({ id, url: await presignPut(key) });
    } catch (e) {
      console.error('[api/upload-url] ký URL thất bại:', e);
      return NextResponse.json({ error: 'Không tạo được URL tải lên.' }, { status: 500 });
    }
  }

  return NextResponse.json({ mode: 'r2', uploads });
}
