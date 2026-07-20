import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Album, Item, ItemBytes, StoreDriver } from '../store';

/**
 * Driver Supabase — metadata album ở Postgres (bảng `albums`, cột `items` JSONB),
 * media ở Storage bucket `media` (private, path <code>/<id>.<ext>).
 * Chỉ chạy phía server bằng service role key. Xem supabase/schema.sql.
 */

const BUCKET = 'media';

type Row = {
  code: string;
  sealed_at: string;
  items: Item[];
  shop_name: string | null;
  seller_note: string | null;
  client_location: string | null;
};

function rowToAlbum(r: Row): Album {
  return {
    code: r.code,
    sealedAt: r.sealed_at,
    items: r.items ?? [],
    shopName: r.shop_name ?? undefined,
    sellerNote: r.seller_note ?? undefined,
    clientLocation: r.client_location ?? undefined,
  };
}

function objectPath(code: string, item: Pick<Item, 'id' | 'ext'>): string {
  return `${code}/${item.id}.${item.ext}`;
}

export function createSupabaseDriver(): StoreDriver {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const supabase: SupabaseClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async saveAlbum(album: Album, files: ItemBytes[]) {
      const uploaded: string[] = [];
      for (const f of files) {
        const item = album.items.find((i) => i.id === f.id);
        if (!item) continue;
        const key = objectPath(album.code, item);
        const up = await supabase.storage
          .from(BUCKET)
          .upload(key, f.bytes, { contentType: item.mimeType, upsert: false });
        if (up.error) {
          if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
          throw new Error(`Storage upload lỗi: ${up.error.message}`);
        }
        uploaded.push(key);
      }

      const ins = await supabase.from('albums').insert({
        code: album.code,
        sealed_at: album.sealedAt,
        items: album.items,
        shop_name: album.shopName ?? null,
        seller_note: album.sellerNote ?? null,
        client_location: album.clientLocation ?? null,
      });
      if (ins.error) {
        if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
        throw new Error(`Ghi metadata lỗi: ${ins.error.message}`);
      }
    },

    async getAlbum(code) {
      const { data, error } = await supabase
        .from('albums')
        .select('*')
        .eq('code', code)
        .maybeSingle();
      if (error) throw new Error(`Đọc metadata lỗi: ${error.message}`);
      return data ? rowToAlbum(data as Row) : null;
    },

    async getItemBytes(code, item) {
      const { data, error } = await supabase.storage.from(BUCKET).download(objectPath(code, item));
      if (error || !data) throw new Error(`Tải media lỗi: ${error?.message ?? 'không có dữ liệu'}`);
      return Buffer.from(await data.arrayBuffer());
    },

    async countByShop(shopName) {
      const { count, error } = await supabase
        .from('albums')
        .select('code', { count: 'exact', head: true })
        .eq('shop_name', shopName);
      if (error) throw new Error(`Đếm lỗi: ${error.message}`);
      return count ?? 0;
    },
  };
}
