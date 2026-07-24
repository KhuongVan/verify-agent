/**
 * videoDuration.ts — sửa "Lỗi" của video quay bằng MediaRecorder trên iOS.
 *
 * MediaRecorder ghi file dạng luồng nên KHÔNG có trường duration trong header:
 * video.duration = Infinity. iOS Safari gặp duration vô hạn thì hiện chữ "Lỗi" ở
 * thanh điều khiển (dù video vẫn phát). Mẹo chuẩn: khi có metadata, tua tới một mốc
 * cực lớn để buộc trình duyệt đọc hết file và tính duration THẬT, rồi tua về 0.
 *
 * Client-safe (không import node) để cả trang người bán lẫn trang khách dùng chung.
 */

import type { SyntheticEvent } from 'react';

/** Gắn vào onLoadedMetadata của <video>. Chỉ chạy khi duration còn vô hạn. */
export function fixInfiniteDuration(e: SyntheticEvent<HTMLVideoElement>): void {
  const v = e.currentTarget;
  if (v.duration !== Infinity && !Number.isNaN(v.duration)) return;

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
