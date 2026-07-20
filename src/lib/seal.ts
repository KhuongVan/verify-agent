import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * seal.ts — chuỗi niêm phong (M1, nấc "chain of custody").
 *
 * Server nhận media -> băm SHA-256 -> ký số Ed25519 lên một "payload chuẩn hoá"
 * (canonical) chứa các sự thật bất biến. Trang xác thực sau này băm lại media và
 * kiểm chữ ký để chứng minh "chưa qua chỉnh sửa sau khi rời app".
 *
 * M1 dùng khoá tạo/lưu tại .data/ cho tiện chạy local. Ở production, khoá riêng
 * phải nằm trong KMS/secret manager (xem SIGNING_*_PEM env override bên dưới).
 */

const DATA_DIR = path.join(process.cwd(), '.data');
const KEY_PATH = path.join(DATA_DIR, 'signing-key.json');

export type KeyMaterial = {
  publicKeyPem: string;
  privateKeyPem: string;
  keyId: string;
};

/** Các trường bất biến được ký. Thứ tự cố định để canonical luôn tái lập được. */
export type SealedFacts = {
  code: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  sealedAt: string; // ISO 8601, server-stamped
};

let cached: KeyMaterial | null = null;

function loadOrCreateKeys(): KeyMaterial {
  if (cached) return cached;

  // Production override: khoá đến từ secret manager qua biến môi trường.
  const envPriv = process.env.SIGNING_PRIVATE_KEY_PEM;
  const envPub = process.env.SIGNING_PUBLIC_KEY_PEM;
  if (envPriv && envPub) {
    cached = {
      privateKeyPem: envPriv.replace(/\\n/g, '\n'),
      publicKeyPem: envPub.replace(/\\n/g, '\n'),
      keyId: process.env.SIGNING_KEY_ID || fingerprint(envPub),
    };
    return cached;
  }

  if (fs.existsSync(KEY_PATH)) {
    cached = JSON.parse(fs.readFileSync(KEY_PATH, 'utf8')) as KeyMaterial;
    return cached;
  }

  // Dev: sinh khoá Ed25519 mới và lưu lại (đã gitignore).
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const km: KeyMaterial = { publicKeyPem, privateKeyPem, keyId: fingerprint(publicKeyPem) };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KEY_PATH, JSON.stringify(km, null, 2), { mode: 0o600 });
  cached = km;
  return km;
}

function fingerprint(pubPem: string): string {
  return crypto.createHash('sha256').update(pubPem).digest('hex').slice(0, 16);
}

export function sha256Hex(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Chuỗi hoá canonical: KHÔNG dùng JSON.stringify object (thứ tự khoá không đảm bảo).
 * Ghép có thứ tự cố định + prefix domain để tránh nhầm lẫn ngữ cảnh chữ ký.
 */
export function canonicalString(f: SealedFacts): string {
  return [
    'nguyenban.v1',
    `code=${f.code}`,
    `sha256=${f.sha256}`,
    `sizeBytes=${f.sizeBytes}`,
    `mimeType=${f.mimeType}`,
    `sealedAt=${f.sealedAt}`,
  ].join('\n');
}

export function sign(facts: SealedFacts): { signatureB64: string; keyId: string } {
  const { privateKeyPem, keyId } = loadOrCreateKeys();
  // Ed25519: thuật toán phải là null (Node tự dùng đúng hàm băm nội bộ).
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
