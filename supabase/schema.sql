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
  created_at      timestamptz not null default now()
);

create index if not exists albums_shop_name_idx on public.albums (shop_name);

-- 2) Bảo mật: chỉ server (service role) được đụng. Bật RLS, không tạo policy
--    cho anon/authenticated => chặn hết; service role bỏ qua RLS.
alter table public.albums enable row level security;

-- 3) Storage: bucket 'media' PRIVATE. Path: <code>/<itemId>.<ext>.
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;
