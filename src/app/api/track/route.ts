/**
 * /api/track — bắn CAPI cho ĐÚNG lượt xem tại khoảnh khắc người dùng vừa bấm
 * "Đồng ý". Với traffic dùng-một-lần đến từ chat, đây là đường bắn CHÍNH chứ
 * không phải ca hiếm (lần đầu mở link thì cookie consent chưa tồn tại lúc render).
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies, headers } from 'next/headers';
import { CONSENT_COOKIE } from '@/lib/consent';
import { normalizeCategoryId } from '@/lib/categories';
import { resolveFbc, sendMetaEvent } from '@/lib/meta-capi';

export const runtime = 'nodejs'; // cần Node runtime cho fetch server-side ổn định

/**
 * Rate-limit thô theo IP, giữ trong bộ nhớ tiến trình. Mỗi instance serverless
 * có bộ đếm riêng nên đây không phải hàng rào chặt — chỉ để chặn spam rẻ tiền.
 */
const HITS = new Map<string, { n: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

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
  const c = cookies();
  const h = headers();

  // Chỉ chấp nhận khi cookie đã granted — chặn gọi lạm dụng.
  if (c.get(CONSENT_COOKIE)?.value !== 'granted') {
    return NextResponse.json({ ok: false, reason: 'no-consent' }, { status: 403 });
  }

  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  if (ip && rateLimited(ip)) {
    return NextResponse.json({ ok: false, reason: 'rate-limited' }, { status: 429 });
  }

  let payload: { eventId?: string; code?: string; category?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-json' }, { status: 400 });
  }

  const { eventId, code, category } = payload;
  if (!eventId || !code) {
    return NextResponse.json({ ok: false, reason: 'missing-fields' }, { status: 400 });
  }

  const ok = await sendMetaEvent({
    eventId,
    sourceUrl: `${req.nextUrl.origin}/v/${code}`,
    ip,
    userAgent: h.get('user-agent') ?? undefined,
    fbp: c.get('_fbp')?.value,
    fbc: resolveFbc(c.get('_fbc')?.value, req.nextUrl.searchParams.get('fbclid')),
    category: normalizeCategoryId(category),
    contentId: code,
  });

  return NextResponse.json({ ok });
}