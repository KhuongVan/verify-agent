import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Proof, StoreDriver } from '../store';

/**
 * Driver Supabase — metadata ở Postgres (bảng `proofs`), media ở Storage
 * (bucket `media`, để PRIVATE). Chỉ chạy phía server bằng service role key.
 * Xem supabase/schema.sql để tạo bảng + bucket.
 */

const BUCKET = 'media';

type Row = {
  code: string;
  mime_type: string;
  ext: string;
  size_bytes: number;
  sha256: string;
  sealed_at: string;
  signature_b64: string;
  key_id: string;
  seller_note: string | null;
  client_captured_at: string | null;
  client_location: string | null;
  liveness_code: string | null;
  shop_name: string | null;
};

function rowToProof(r: Row): Proof {
  return {
    code: r.code,
    mimeType: r.mime_type,
    ext: r.ext,
    sizeBytes: Number(r.size_bytes),
    sha256: r.sha256,
    sealedAt: r.sealed_at,
    signatureB64: r.signature_b64,
    keyId: r.key_id,
    sellerNote: r.seller_note ?? undefined,
    clientCapturedAt: r.client_captured_at ?? undefined,
    clientLocation: r.client_location ?? undefined,
    livenessCode: r.liveness_code ?? undefined,
    shopName: r.shop_name ?? undefined,
  };
}

function proofToRow(p: Proof): Row {
  return {
    code: p.code,
    mime_type: p.mimeType,
    ext: p.ext,
    size_bytes: p.sizeBytes,
    sha256: p.sha256,
    sealed_at: p.sealedAt,
    signature_b64: p.signatureB64,
    key_id: p.keyId,
    seller_note: p.sellerNote ?? null,
    client_captured_at: p.clientCapturedAt ?? null,
    client_location: p.clientLocation ?? null,
    liveness_code: p.livenessCode ?? null,
    shop_name: p.shopName ?? null,
  };
}

export function createSupabaseDriver(): StoreDriver {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const objectPath = (p: Pick<Proof, 'code' | 'ext'>) => `${p.code}.${p.ext}`;

  return {
    async saveProof(proof, bytes) {
      const up = await supabase.storage.from(BUCKET).upload(objectPath(proof), bytes, {
        contentType: proof.mimeType,
        upsert: false,
      });
      if (up.error) throw new Error(`Storage upload lỗi: ${up.error.message}`);

      const ins = await supabase.from('proofs').insert(proofToRow(proof));
      if (ins.error) {
        // Rollback file nếu ghi metadata hỏng, tránh rác mồ côi.
        await supabase.storage.from(BUCKET).remove([objectPath(proof)]);
        throw new Error(`Ghi metadata lỗi: ${ins.error.message}`);
      }
    },

    async getProof(code) {
      const { data, error } = await supabase
        .from('proofs')
        .select('*')
        .eq('code', code)
        .maybeSingle();
      if (error) throw new Error(`Đọc metadata lỗi: ${error.message}`);
      return data ? rowToProof(data as Row) : null;
    },

    async getMediaBytes(proof) {
      const { data, error } = await supabase.storage.from(BUCKET).download(objectPath(proof));
      if (error || !data) throw new Error(`Tải media lỗi: ${error?.message ?? 'không có dữ liệu'}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async countByShop(shopName) {
      const { count, error } = await supabase
        .from('proofs')
        .select('code', { count: 'exact', head: true })
        .eq('shop_name', shopName);
      if (error) throw new Error(`Đếm lỗi: ${error.message}`);
      return count ?? 0;
    },
  };
}
