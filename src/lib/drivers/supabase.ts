import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { deleteObjects, getObject, putObject } from '../r2';
import type { Album, ConsentEntry, Item, ItemBytes, StoreDriver } from '../store';

/**
 * Driver Supabase — metadata album ở Postgres (bảng `albums`, cột `items` JSONB).
 * MEDIA (bytes ảnh/video) lưu trên Cloudflare R2 (xem lib/r2.ts) để egress miễn
 * phí; khách tải thẳng từ R2 qua custom domain. Supabase chỉ còn giữ metadata.
 * Chỉ chạy phía server bằng service role key. Xem supabase/schema.sql.
 */

type Row = {
  code: string;
  sealed_at: string;
  items: Item[];
  shop_name: string | null;
  seller_note: string | null;
  client_location: string | null;
  category_id: string | null;
};

function rowToAlbum(r: Row): Album {
  return {
    code: r.code,
    sealedAt: r.sealed_at,
    items: r.items ?? [],
    shopName: r.shop_name ?? undefined,
    sellerNote: r.seller_note ?? undefined,
    clientLocation: r.client_location ?? undefined,
    // Album tạo trước khi có taxonomy sẽ là null -> để undefined, nơi dùng tự fallback.
    categoryId: r.category_id ?? undefined,
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
    async reserveAlbum(code: string) {
      // Bản ghi rỗng giữ chỗ. items=[] => trang khách hiểu là "đang tải".
      // Không đè nếu đã tồn tại (tránh xoá mất album đã seal nếu trùng mã hiếm gặp).
      const { error } = await supabase
        .from('albums')
        .insert({ code, sealed_at: new Date().toISOString(), items: [] });
      if (error && error.code !== '23505') {
        // 23505 = unique_violation: mã đã tồn tại, coi như đặt chỗ thành công.
        throw new Error(`Đặt mã lỗi: ${error.message}`);
      }
    },
    // Upsert theo code: lấp bản ghi đã reserve (items=[]) thành đầy đủ; chưa
    // reserve thì là insert thường.
    async saveAlbumMeta(album: Album) {
      const ins = await supabase.from('albums').upsert(
        {
          code: album.code,
          sealed_at: album.sealedAt,
          items: album.items,
          shop_name: album.shopName ?? null,
          seller_note: album.sellerNote ?? null,
          client_location: album.clientLocation ?? null,
          category_id: album.categoryId ?? null,
        },
        { onConflict: 'code' },
      );
      if (ins.error) throw new Error(`Ghi metadata lỗi: ${ins.error.message}`);
    },

    async saveAlbum(album: Album, files: ItemBytes[]) {
      // 1) Bytes -> R2.
      const uploaded: string[] = [];
      for (const f of files) {
        const item = album.items.find((i) => i.id === f.id);
        if (!item) continue;
        const key = objectPath(album.code, item);
        try {
          await putObject(key, f.bytes, item.mimeType);
        } catch (e) {
          if (uploaded.length) await deleteObjects(uploaded);
          throw e;
        }
        uploaded.push(key);
      }

      // 2) Metadata -> Postgres.
      try {
        await this.saveAlbumMeta(album);
      } catch (e) {
        if (uploaded.length) await deleteObjects(uploaded);
        throw e;
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
      // Đọc từ R2 (server -> R2, egress vẫn miễn phí). Dùng cho verify.
      return getObject(objectPath(code, item));
    },

    async countByShop(shopName) {
      const { count, error } = await supabase
        .from('albums')
        .select('code', { count: 'exact', head: true })
        .eq('shop_name', shopName);
      if (error) throw new Error(`Đếm lỗi: ${error.message}`);
      return count ?? 0;
    },

    async logConsent(entry: ConsentEntry) {
      const { error } = await supabase.from('consent_log').insert({
        at: entry.at,
        state: entry.state,
        ip_hash: entry.ipHash ?? null,
        user_agent: entry.userAgent ?? null,
      });
      if (error) throw new Error(`Ghi nhật ký consent lỗi: ${error.message}`);
    },
  };
}
