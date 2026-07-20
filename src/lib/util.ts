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

/** Định dạng thời gian kiểu VN: HH:MM:SS · DD/MM/YYYY */
export function formatVN(iso: string): string {
  const d = new Date(iso);
  const p = (x: number) => x.toString().padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} · ${p(d.getDate())}/${p(
    d.getMonth() + 1,
  )}/${d.getFullYear()}`;
}
