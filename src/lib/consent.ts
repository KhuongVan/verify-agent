/**
 * consent.ts — hằng số & kiểu dùng CHUNG cho cả client lẫn server.
 *
 * Mô hình OPT-IN theo Luật Bảo vệ dữ liệu cá nhân (91/2025/QH15, hiệu lực
 * 1/1/2026): KHÔNG bắn tracking trước khi người dùng bấm đồng ý, và phải cho
 * rút lại bất cứ lúc nào (xem /privacy).
 *
 * CỐ Ý không import 'next/headers' ở đây — banner và nút rút lại là client
 * component, chúng chỉ cần tên cookie. Phần đọc cookie phía server nằm ở
 * consent-server.ts.
 */

export const CONSENT_COOKIE = 'at_consent';

/** 180 ngày — hết hạn thì hỏi lại, không mặc định coi là đã đồng ý. */
export const CONSENT_MAX_AGE = 60 * 60 * 24 * 180;

export type Consent = 'granted' | 'denied' | 'unset';