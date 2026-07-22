/**
 * inapp.ts — nhận biết trình duyệt nhúng trong app nhắn tin (in-app browser).
 *
 * VÌ SAO CẦN: webview của Zalo/Messenger/TikTok chặn hoặc giới hạn getUserMedia.
 * Người bán cấp quyền camera xong vẫn chỉ thấy màn đen — lỗi này không hiện
 * thông báo gì, nên nếu không cảnh báo trước thì họ tưởng app hỏng.
 *
 * Chỉ áp dụng cho LUỒNG CHỤP. Trang /v/ (khách xem ảnh) chạy tốt trong webview
 * và phần lớn traffic đến từ chat — tuyệt đối không chặn ở đó.
 */

export type InAppInfo = {
  isInApp: boolean;
  /** Tên app để nói đúng tên trong thông báo, ví dụ "Zalo". */
  appName: string | null;
  os: 'ios' | 'android' | 'other';
};

const PATTERNS: Array<{ re: RegExp; name: string }> = [
  { re: /\bZalo\b/i, name: 'Zalo' },
  { re: /FBAN|FBAV|FB_IAB|FBIOS|Messenger/i, name: 'Messenger' },
  { re: /Instagram/i, name: 'Instagram' },
  { re: /BytedanceWebview|musical_ly|TikTok|Aweme/i, name: 'TikTok' },
  { re: /MicroMessenger/i, name: 'WeChat' },
  { re: /\bLine\//i, name: 'LINE' },
  { re: /Twitter/i, name: 'X' },
];

export function detectInApp(ua: string): InAppInfo {
  const os: InAppInfo['os'] = /iPhone|iPad|iPod/i.test(ua)
    ? 'ios'
    : /Android/i.test(ua)
      ? 'android'
      : 'other';

  for (const p of PATTERNS) {
    if (p.re.test(ua)) return { isInApp: true, appName: p.name, os };
  }

  // Webview Android chung: có "wv" hoặc thiếu hẳn "Chrome/Safari" thường là app nhúng.
  if (os === 'android' && /; wv\)/i.test(ua)) {
    return { isInApp: true, appName: null, os };
  }

  return { isInApp: false, appName: null, os };
}

/**
 * URL mở trang hiện tại bằng TRÌNH DUYỆT MẶC ĐỊNH trên Android (intent://).
 *
 * Cố ý KHÔNG đặt package=com.android.chrome: ép cứng Chrome sẽ bỏ qua lựa chọn
 * của người dùng và hỏng hẳn trên máy không cài Chrome. Để trống thì Android tự
 * giao cho trình duyệt mặc định — không cần biết đó là trình duyệt nào.
 */
export function androidBrowserIntent(url: string): string {
  const u = new URL(url);
  const withoutScheme = `${u.host}${u.pathname}${u.search}`;
  const fallback = encodeURIComponent(url);
  return `intent://${withoutScheme}#Intent;scheme=https;S.browser_fallback_url=${fallback};end`;
}

/**
 * URL "ép" iOS mở Safari.
 *
 * Apple KHÔNG có API hay scheme chính thức nào để webview bật Safari. Nhưng
 * `x-safari-https://` là scheme mà iOS tự chuyển sang Safari khi app nhúng
 * không xử lý — hoạt động trong nhiều in-app browser (Zalo, Facebook...).
 *
 * Vì không được tài liệu hoá, PHẢI coi đây là nỗ lực "may thì được": bấm xong mà
 * trang vẫn đứng yên thì lùi về hướng dẫn thao tác tay.
 */
export function iosSafariUrl(url: string): string {
  return `x-safari-${url}`;
}