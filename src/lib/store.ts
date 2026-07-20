import fs from 'node:fs';
import path from 'node:path';

/**
 * store.ts — lớp lưu trữ (M1 stand-in).
 *
 * Metadata: file JSON tại .data/proofs.json.
 * Media gốc: .data/media/<code>.<ext>.
 *
 * ĐÂY LÀ ĐƯỜNG NỐI để M2/M3 thay bằng Supabase (Postgres) + Mux/R2. Chỉ cần
 * giữ nguyên chữ ký các hàm bên dưới, phần còn lại của app không phải sửa.
 */

const DATA_DIR = path.join(process.cwd(), '.data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const DB_PATH = path.join(DATA_DIR, 'proofs.json');

export type Proof = {
  code: string;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
  sealedAt: string; // server timestamp (ISO)
  signatureB64: string;
  keyId: string;
  // Thông tin do client khai — KHÔNG được ký, hiển thị tách bạch ("người bán nói").
  sellerNote?: string;
  clientCapturedAt?: string;
  clientLocation?: string;
  // Placeholder cho M2 (liveness). Chưa dùng để phán quyết ở M1.
  livenessCode?: string;
  // Danh tính shop (M3 sẽ thay bằng bảng shop thật).
  shopName?: string;
};

function ensure(): void {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, '[]');
}

function readAll(): Proof[] {
  ensure();
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')) as Proof[];
  } catch {
    return [];
  }
}

function writeAll(list: Proof[]): void {
  ensure();
  fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2));
}

function mediaPath(p: Pick<Proof, 'code' | 'ext'>): string {
  return path.join(MEDIA_DIR, `${p.code}.${p.ext}`);
}

export function saveProof(proof: Proof, bytes: Buffer): void {
  ensure();
  fs.writeFileSync(mediaPath(proof), bytes);
  const list = readAll();
  list.push(proof);
  writeAll(list);
}

export function getProof(code: string): Proof | null {
  return readAll().find((p) => p.code === code) ?? null;
}

export function readMedia(proof: Proof): Buffer {
  return fs.readFileSync(mediaPath(proof));
}

/** Đếm số video đã xác thực của một shop (M1: theo tên; M3: theo shopId). */
export function countByShop(shopName: string): number {
  return readAll().filter((p) => p.shopName === shopName).length;
}
