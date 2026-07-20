-- Nguyên Bản — schema Supabase (M3)
-- Chạy trong Supabase Studio → SQL Editor.

-- 1) Bảng metadata bằng chứng ------------------------------------------------
create table if not exists public.proofs (
  code               text primary key,
  mime_type          text        not null,
  ext                text        not null,
  size_bytes         bigint      not null,
  sha256             text        not null,
  sealed_at          timestamptz not null,
  signature_b64      text        not null,
  key_id             text        not null,
  seller_note        text,
  client_captured_at text,
  client_location    text,
  liveness_code      text,
  shop_name          text,
  created_at         timestamptz not null default now()
);

create index if not exists proofs_shop_name_idx on public.proofs (shop_name);

-- 2) Bảo mật: chỉ server (service role) được đụng vào.
--    Bật RLS và KHÔNG tạo policy cho anon/authenticated => mặc định chặn hết.
--    Service role bỏ qua RLS nên các route server vẫn hoạt động.
alter table public.proofs enable row level security;

-- 3) Storage: bucket 'media' để PRIVATE (media phát qua server, same-origin).
insert into storage.buckets (id, name, public)
values ('media', 'media', false)
on conflict (id) do nothing;

-- Không thêm policy cho bucket => chỉ service role truy cập được. Đủ cho M3.
