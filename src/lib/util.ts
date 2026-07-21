import crypto from 'node:crypto';

// Bảng chữ Crockford-ish, bỏ ký tự dễ nhầm (0/O, 1/I/L).
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Mã bằng chứng công khai trong URL: dạng XXXX-XXXX. */
export function newCode(): string {
  const bytes = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
}

/** Mã liveness 6 số hiển thị khi quay (M2 sẽ dùng để chống phát lại). */
export function newLivenessCode(): string {
  const n = crypto.randomInt(0, 1_000_000);
  return n.toString().padStart(6, '0');
}

const MIME_EXT: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function extFromMime(mime: string): string {
  return MIME_EXT[mime] ?? 'bin';
}

export function isVideo(mime: string): boolean {
  return mime.startsWith('video/');
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Định dạng thời gian kiểu VN: HH:MM:SS · DD/MM/YYYY
 *
 * Ép múi giờ Asia/Ho_Chi_Minh: trang được render ở server (Vercel chạy UTC), nên
 * dùng giờ máy sẽ hiện lệch 7 tiếng — sai ngay ở dòng "niêm phong lúc", tức là
 * sai đúng chỗ người mua dựa vào để tin.
 */
export function formatVN(iso: string): string {
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso));

  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('hour')}:${g('minute')}:${g('second')} · ${g('day')}/${g('month')}/${g('year')}`;
}
