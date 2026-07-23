/**
 * /api/album/[code] — trạng thái nhẹ để trang khách biết ảnh đã lên chưa.
 *
 * Khác /api/verify: KHÔNG tải/băm media (nặng), chỉ đọc metadata. Dùng cho
 * PendingWatcher poll khi album còn "đang tải" (items rỗng do reserve).
 */

import { NextResponse } from 'next/server';
import { getAlbum } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const album = await getAlbum(params.code);
  if (!album) {
    return NextResponse.json({ exists: false, ready: false }, { status: 404 });
  }
  return NextResponse.json({ exists: true, ready: album.items.length > 0, count: album.items.length });
}
