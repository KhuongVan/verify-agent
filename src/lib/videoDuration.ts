/**
 * videoDuration.ts — sửa duration vô hạn của video quay bằng MediaRecorder.
 *
 * MediaRecorder ghi file dạng luồng nên KHÔNG có trường duration trong header:
 * video.duration = Infinity -> thanh tua hỏng, iOS còn hiện chữ "Lỗi". Mẹo chuẩn
 * (Chrome/Android): khi có metadata, tua tới một mốc cực lớn để buộc trình duyệt
 * đọc hết file và tính duration THẬT, rồi tua về 0.
 *
 * QUAN TRỌNG — không chạy mẹo này trên iOS/WebKit: tua tới mốc cực lớn trên file
 * kiểu này làm thẻ video rơi vào trạng thái LỖI HẲN (biểu tượng ▶ gạch chéo,
 * không phát được nữa) — tệ hơn nhiều so với thiếu duration. Gốc rễ phía iOS được
 * xử ở chỗ khác: pickMime ưu tiên quay mp4/H.264 (đủ duration, phát native).
 *
 * Client-safe (không import node) để cả trang người bán lẫn trang khách dùng chung.
 */

import type { SyntheticEvent } from 'react';

/** iOS mọi trình duyệt + Safari máy Mac đều là WebKit — nơi mẹo tua gây lỗi. */
function isWebKitNative(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const ios =
    /iP(hone|ad|od)/.test(ua) ||
    // iPad đời mới khai là MacIntel nhưng có cảm ứng.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari\//.test(ua) && !/Chrom(e|ium)|Edg\/|OPR\//.test(ua);
  return ios || safari;
}

/** Gắn vào onLoadedMetadata của <video>. Chỉ chạy khi duration còn vô hạn. */
export function fixInfiniteDuration(e: SyntheticEvent<HTMLVideoElement>): void {
  const v = e.currentTarget;
  if (v.duration !== Infinity) return; // NaN/finite: không đụng vào
  if (isWebKitNative()) return; // WebKit: mẹo tua làm video hỏng hẳn — bỏ qua

  const onTime = () => {
    v.removeEventListener('timeupdate', onTime);
    if (v.currentTime > 0) v.currentTime = 0; // tua về đầu để phát bình thường
  };
  v.addEventListener('timeupdate', onTime);
  // Tua tới mốc cực lớn -> trình duyệt kẹp về cuối thật và cập nhật duration.
  try {
    v.currentTime = 1e101;
  } catch {
    /* vài trình duyệt ném lỗi nếu chưa seekable — bỏ qua, không ảnh hưởng phát */
  }
}
