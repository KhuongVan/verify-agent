import 'server-only';
import { cookies } from 'next/headers';
import { CONSENT_COOKIE, type Consent } from './consent';

/**
 * Đọc trạng thái đồng ý từ cookie ở phía server.
 *
 * Next 14: cookies() trả về đồng bộ (Next 15 mới đổi thành Promise). Giữ hàm này
 * async để nơi gọi không phải sửa khi nâng lên Next 15.
 */
export async function getConsent(): Promise<Consent> {
  const v = cookies().get(CONSENT_COOKIE)?.value;
  return v === 'granted' || v === 'denied' ? v : 'unset';
}