/**
 * store.ts — API lưu trữ thống nhất, chọn driver theo môi trường.
 *
 * Mô hình ALBUM: một mã (code) = một link, chứa NHIỀU mục (ảnh/video). Mỗi mục
 * được ký số riêng để dấu niêm phong hoạt động độc lập từng mục.
 *
 * Có đủ NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY -> driver Supabase.
 * Không có -> driver local (filesystem, cho dev).
 */

export type MediaKind = 'photo' | 'video';

export type Item = {
  id: string; // duy nhất trong album, ví dụ "i0", "i1"
  kind: MediaKind;
  mimeType: string;
  ext: string;
  sizeBytes: number;
  sha256: string;
  signatureB64: string;
  keyId: string;
};

export type Album = {
  code: string;
  sealedAt: string; // server timestamp (ISO)
  items: Item[];
  // Do client khai — KHÔNG được ký, hiển thị tách bạch ("người bán nói").
  shopName?: string;
  sellerNote?: string;
  clientLocation?: string;
  /** Ngành hàng (xem lib/categories). Người bán chọn; KHÔNG nằm trong chữ ký. */
  categoryId?: string;
};

/** Bytes kèm theo từng mục khi lưu album. */
export type ItemBytes = { id: string; bytes: Buffer };

/**
 * Một dòng nhật ký consent — bằng chứng đã xin phép trước khi thu dữ liệu
 * (Luật 91/2025/QH15). Cố ý KHÔNG lưu IP thô: chỉ hash, đủ để đếm/đối soát.
 */
export type ConsentEntry = {
  at: string; // ISO
  state: 'granted' | 'denied';
  ipHash?: string;
  userAgent?: string;
};

export interface StoreDriver {
  saveAlbum(album: Album, files: ItemBytes[]): Promise<void>;
  getAlbum(code: string): Promise<Album | null>;
  getItemBytes(code: string, item: Item): Promise<Buffer>;
  countByShop(shopName: string): Promise<number>;
  logConsent(entry: ConsentEntry): Promise<void>;
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

export async function saveAlbum(album: Album, files: ItemBytes[]): Promise<void> {
  return (await driver()).saveAlbum(album, files);
}

export async function getAlbum(code: string): Promise<Album | null> {
  return (await driver()).getAlbum(code);
}

export async function getItemBytes(code: string, item: Item): Promise<Buffer> {
  return (await driver()).getItemBytes(code, item);
}

export async function countByShop(shopName: string): Promise<number> {
  return (await driver()).countByShop(shopName);
}

export async function logConsent(entry: ConsentEntry): Promise<void> {
  return (await driver()).logConsent(entry);
}
