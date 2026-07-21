import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * seal.ts — chuỗi niêm phong (nấc "chain of custody").
 *
 * Mỗi MỤC trong album được ký riêng: server băm SHA-256 -> ký Ed25519 lên một
 * "payload chuẩn hoá" gồm code + itemId + hash + ... Trang xác thực băm lại từng
 * mục và kiểm chữ ký để chứng minh "chưa qua chỉnh sửa sau khi rời app".
 */

const DATA_DIR = path.join(process.cwd(), '.data');
const KEY_PATH = path.join(DATA_DIR, 'signing-key.json');

export type KeyMaterial = {
  publicKeyPem: string;
  privateKeyPem: string;
  keyId: string;
};

/** Các trường bất biến được ký cho MỘT mục. Thứ tự cố định để tái lập canonical. */
export type SealedFacts = {
  code: string;
  itemId: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  sealedAt: string; // ISO 8601, server-stamped (chung cho cả album)
};

let cached: KeyMaterial | null = null;

function loadOrCreateKeys(): KeyMaterial {
  if (cached) return cached;

  const envPriv = process.env.SIGNING_PRIVATE_KEY_PEM;
  const envPub = process.env.SIGNING_PUBLIC_KEY_PEM;
  if (envPriv && envPub) {
    const privateKeyPem = normalizePem(envPriv, 'PRIVATE KEY');
    const publicKeyPem = normalizePem(envPub, 'PUBLIC KEY');
    cached = {
      privateKeyPem,
      publicKeyPem,
      keyId: process.env.SIGNING_KEY_ID || fingerprint(publicKeyPem),
    };
    return cached;
  }

  if (fs.existsSync(KEY_PATH)) {
    cached = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8')) as KeyMaterial;
    return cached;
  }

  // Chốt an toàn: ở production (đã cấu hình Supabase) mà thiếu khoá trong env thì
  // KHÔNG tự sinh — vì serverless mỗi cold start ra khoá khác, làm chữ ký cũ vỡ.
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Thiếu khoá ký: hãy đặt SIGNING_PRIVATE_KEY_PEM và SIGNING_PUBLIC_KEY_PEM (chạy `npm run genkey`).',
    );
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const km: KeyMaterial = { publicKeyPem, privateKeyPem, keyId: fingerprint(publicKeyPem) };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEY_PATH, JSON.stringify(km, null, 2), { mode: 0o600 });
  cached = km;
  return km;
}

/**
 * Chuẩn hoá khoá lấy từ env về PEM hợp lệ.
 * Dán khoá vào dashboard (Vercel) rất dễ rụng header/footer hoặc xuống dòng —
 * khi đó OpenSSL không decode được và crypto.sign() văng. Ở đây ta khôi phục
 * khung PEM nếu chỉ còn phần base64 thân khoá.
 */
function normalizePem(raw: string, label: 'PRIVATE KEY' | 'PUBLIC KEY'): string {
  const s = raw.replace(/\\n/g, '\n').trim();
  if (s.includes('-----BEGIN')) return s.endsWith('\n') ? s : `${s}\n`;

  const body = s.replace(/\s+/g, '');
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function fingerprint(pubPem: string): string {
  return crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 16);
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Đưa dấu thời gian về đúng MỘT dạng chữ trước khi ký/kiểm.
 * Postgres (timestamptz) trả "…625+00:00" trong khi lúc ký là "…625Z" — cùng một
 * thời điểm nhưng khác byte, đủ để chữ ký vỡ. Chuẩn hoá về ISO-UTC (hậu tố Z).
 */
function canonicalTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? iso : t.toISOString();
}

export function canonicalString(f: SealedFacts): string {
  return [
    'nguyenban.v1',
    `code=${f.code}`,
    `itemId=${f.itemId}`,
    `sha256=${f.sha256}`,
    `sizeBytes=${f.sizeBytes}`,
    `mimeType=${f.mimeType}`,
    `sealedAt=${canonicalTime(f.sealedAt)}`,
  ].join('\n');
}

export function sign(facts: SealedFacts): { signatureB64: string; keyId: string } {
  const { privateKeyPem, keyId } = loadOrCreateKeys();
  const sig = crypto.sign(null, Buffer.from(canonicalString(facts), 'utf8'), privateKeyPem);
  return { signatureB64: sig.toString('base64'), keyId };
}

export function verify(facts: SealedFacts, signatureB64: string): boolean {
  const { publicKeyPem } = loadOrCreateKeys();
  try {
    return crypto.verify(
      null,
      Buffer.from(canonicalString(facts), 'utf8'),
      publicKeyPem,
      Buffer.from(signatureB64, 'base64'),
    );
  } catch {
    return false;
  }
}

export function getPublicKeyPem(): string {
  return loadOrCreateKeys().publicKeyPem;
}

export function getKeyId(): string {
  return loadOrCreateKeys().keyId;
}
