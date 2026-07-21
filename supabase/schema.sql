-- Nguyên Bản — schema Supabase (mô hình ALBUM)
-- Chạy trong Supabase Studio → SQL Editor.

-- 1) Bảng album: 1 mã = 1 link, chứa nhiều mục (items) dạng JSONB.
create table if not exists public.albums (
  code            text primary key,
  sealed_at       timestamptz not null,
  items           jsonb       not null,   -- [{ id, kind, mimeType, ext, sizeBytes, sha256, signatureB64, keyId }]
  shop_name       text,
  seller_note     text,
  client_location text,
  category_id     text,                   -- ngành hàng, xem src/lib/categories.ts. NULL = album cũ trước taxonomy.
  created_at      timestamptz not null default now()
);

-- Migration cho project đã chạy từ trước (an toàn khi chạy lại).
alter table public.albums add column if not exists category_id text;

create index if not exists albums_shop_name_idx on public.albums (shop_name);
create index if not exists albums_category_id_idx on public.albums (category_id);

-- 2) Bảo mật: chỉ server (service role) được đụng. Bật RLS, không tạo policy
--    cho anon/authenticated => chặn hết; service role bỏ qua RLS.
alter table public.albums enable row level security;

-- 2b) Nhật ký consent — bằng chứng đã xin phép trước khi thu dữ liệu
--     (Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15). KHÔNG lưu IP thô, chỉ hash.
create table if not exists public.consent_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null,
  state      text        not null check (state in ('granted', 'denied')),
  ip_hash    text,
  user_agent text
);

create index if not exists consent_log_at_idx on public.consent_log (at desc);

alter table public.consent_log enable row level security;

-- 3) Storage: bucket 'media' PRIVATE. Path: <code>/<itemId>.<ext>.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
