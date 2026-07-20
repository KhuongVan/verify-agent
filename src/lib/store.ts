/**
 * store.ts — API lưu trữ thống nhất, chọn driver theo môi trường.
 *
 * Có đủ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY  -> driver Supabase
 * (Postgres + Storage). Không có -> driver local (filesystem, cho dev).
 *
 * Phần còn lại của app chỉ gọi các hàm dưới đây, không biết driver nào đang chạy.
 */

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
  livenessCode?: string;
  shopName?: string;
};

export interface StoreDriver {
  saveProof(proof: Proof, bytes: Buffer): Promise<void>;
  getProof(code: string): Promise<Proof | null>;
  getMediaBytes(proof: Proof): Promise<Buffer>;
  countByShop(shopName: string): Promise<number>;
}

export function storeMode(): 'supabase' | 'local' {
  return process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? 'supabase'
    : 'local';
}

let driverPromise: Promise<StoreDriver> | null = null;

function driver(): Promise<StoreDriver> {
  if (!driverPromise) {
    driverPromise =
      storeMode() === 'supabase'
        ? import('./drivers/supabase').then((m) => m.createSupabaseDriver())
        : import('./drivers/local').then((m) => m.createLocalDriver());
  }
  return driverPromise;
}

export async function saveProof(proof: Proof, bytes: Buffer): Promise<void> {
  return (await driver()).saveProof(proof, bytes);
}

export async function getProof(code: string): Promise<Proof | null> {
  return (await driver()).getProof(code);
}

export async function getMediaBytes(proof: Proof): Promise<Buffer> {
  return (await driver()).getMediaBytes(proof);
}

export async function countByShop(shopName: string): Promise<number> {
  return (await driver()).countByShop(shopName);
}
