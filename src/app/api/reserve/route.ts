/**
 * /api/reserve — đặt trước một MÃ (chưa có ảnh) để client biết URL ngay.
 *
 * Vì sao cần: navigator.share() phải gọi ngay trong cú chạm của người dùng, không
 * được đi qua await (iOS Safari cấm hẳn). Nếu chờ upload xong mới có mã thì share
 * bị chặn. Đặt mã trước ở màn "Xem lại" -> lúc bấm "Tạo link" đã có URL -> share
 * gọi được đồng bộ. Ảnh upload sau (xem /api/seal).
 *
 * Bản ghi tạo ra có items=[] -> trang khách hiểu là "đang tải".
 */

import { NextRequest, NextResponse } from 'next/server';
import { reserveAlbum } from '@/lib/store';
import { newCode } from '@/lib/util';

export const runtime = 'nodejs';

// Rate-limit thô theo IP (giống /api/track) — chặn spam tạo bản ghi rác.
const HITS = new Map<string, { n: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 30;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || now > cur.resetAt) {
    HITS.set(ip, { n: 1, resetAt: now + WINDOW_MS });
    if (HITS.size > 5_000) {
      for (const [k, v] of HITS) if (now > v.resetAt) HITS.delete(k);
    }
    return false;
  }
  cur.n += 1;
  return cur.n > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip && rateLimited(ip)) {
    return NextResponse.json({ error: 'Quá nhiều yêu cầu, thử lại sau.' }, { status: 429 });
  }

  const code = newCode();
  try {
    await reserveAlbum(code);
  } catch (e) {
    console.error('[api/reserve] đặt mã thất bại:', e);
    return NextResponse.json({ error: 'Không đặt được mã.' }, { status: 500 });
  }

  return NextResponse.json({ code, url: `/v/${code}` }, { status: 201 });
}
