/**
 * /api/consent — ghi nhật ký lựa chọn đồng ý/từ chối.
 *
 * Đây là BẰNG CHỨNG đã xin phép trước khi thu dữ liệu (Luật 91/2025/QH15).
 * Cookie vẫn do client đặt (banner) để lựa chọn có hiệu lực tức thì kể cả khi
 * route này lỗi — ghi nhật ký không bao giờ được cản trải nghiệm người dùng.
 */

import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { logConsent } from '@/lib/store';

export const runtime = 'nodejs';

/**
 * Băm IP kèm muối để không lưu IP thô mà vẫn đối soát được.
 * Không có muối riêng thì dùng khoá ký làm muối — miễn là không rời khỏi server.
 */
function hashIp(ip: string): string {
  const salt = process.env.CONSENT_IP_SALT ?? process.env.SIGNING_KEY_ID ?? 'anhthat';
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export async function POST(req: NextRequest) {
  let payload: { state?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: 'bad-json' }, { status: 400 });
  }

  const state = payload.state;
  if (state !== 'granted' && state !== 'denied') {
    return NextResponse.json({ ok: false, reason: 'bad-state' }, { status: 400 });
  }

  const h = headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim();

  try {
    await logConsent({
      at: new Date().toISOString(),
      state,
      ipHash: ip ? hashIp(ip) : undefined,
      userAgent: h.get('user-agent') ?? undefined,
    });
  } catch (e) {
    // Nuốt lỗi có chủ đích: lựa chọn của người dùng đã có hiệu lực qua cookie rồi.
    console.error('[consent] ghi nhật ký thất bại:', e);
    return NextResponse.json({ ok: false, reason: 'log-failed' }, { status: 200 });
  }

  return NextResponse.json({ ok: true });
}