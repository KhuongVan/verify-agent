/**
 * meta-capi.ts — gửi sự kiện tới Meta Conversions API (server-side).
 *
 * Đây là NGUỒN SỰ THẬT của tracking: gần như toàn bộ traffic /v/ mở trong
 * in-app browser (Zalo/Messenger/TikTok) nơi pixel client bị bóp nặng.
 * Pixel client chỉ là lớp phụ, dedup bằng `event_id` chung.
 *
 * KHÔNG thu PII của người mua — chỉ IP/UA/_fbp/_fbc.
 */

const GRAPH_VERSION = 'v21.0'; // đối chiếu version hiện hành trong Events Manager

export type CapiInput = {
  eventId: string; // khớp với client để Meta dedup
  sourceUrl: string; // URL trang /v/CODE
  ip?: string;
  userAgent?: string;
  fbp?: string; // cookie _fbp (nếu có)
  fbc?: string; // cookie _fbc, hoặc suy từ ?fbclid
  category?: string; // category_id của album
  contentId?: string; // album_code
  eventName?: string; // mặc định ViewContent
};

/** Đã cấu hình đủ để bắn chưa. Thiếu env là trạng thái BÌNH THƯỜNG khi chưa có creds. */
export function isCapiConfigured(): boolean {
  return Boolean(process.env.META_PIXEL_ID && process.env.META_CAPI_TOKEN);
}

export async function sendMetaEvent(e: CapiInput): Promise<boolean> {
  // Đọc env trong hàm (không phải top-level) để bật/tắt được mà không cần rebuild.
  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_TOKEN; // server-only, KHÔNG NEXT_PUBLIC_

  if (!pixelId || !accessToken) {
    // Chưa cấu hình -> im lặng bỏ qua, KHÔNG throw (trang /v/ phải luôn hiển thị được).
    console.info('[CAPI] bỏ qua: chưa đặt META_PIXEL_ID / META_CAPI_TOKEN');
    return false;
  }

  const body = {
    data: [
      {
        event_name: e.eventName ?? 'ViewContent',
        event_time: Math.floor(Date.now() / 1000),
        event_id: e.eventId, // ← dedup với client
        action_source: 'website',
        event_source_url: e.sourceUrl,
        user_data: {
          ...(e.ip ? { client_ip_address: e.ip } : {}),
          ...(e.userAgent ? { client_user_agent: e.userAgent } : {}),
          ...(e.fbp ? { fbp: e.fbp } : {}),
          ...(e.fbc ? { fbc: e.fbc } : {}),
        },
        custom_data: {
          ...(e.category ? { content_category: e.category } : {}),
          ...(e.contentId ? { content_ids: [e.contentId], content_type: 'product' } : {}),
        },
      },
    ],
    // Chỉ khi test — XOÁ biến này khỏi env production.
    ...(process.env.META_TEST_EVENT_CODE
      ? { test_event_code: process.env.META_TEST_EVENT_CODE }
      : {}),
  };

  try {
    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${accessToken}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[CAPI] lỗi', res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('[CAPI] exception', err);
    return false;
  }
}

/**
 * Chọn giá trị `fbc` đúng chuẩn Meta.
 *
 * Cookie `_fbc` ĐÃ là chuỗi hoàn chỉnh dạng `fb.1.<timestamp>.<fbclid>` — dùng
 * thẳng. Chỉ khi không có cookie mới dựng từ tham số `?fbclid` trên URL.
 * (Bọc thêm một lớp `fb.1.` quanh cookie sẽ tạo chuỗi hỏng và Meta bỏ qua.)
 */
export function resolveFbc(fbcCookie?: string | null, fbclid?: string | null): string | undefined {
  if (fbcCookie) return fbcCookie;
  if (!fbclid) return undefined;
  return `fb.1.${Date.now()}.${fbclid}`;
}