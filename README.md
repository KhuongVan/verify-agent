# Nguyên Bản — Web MVP

App Next.js (App Router, TypeScript). **Mốc M1**: niêm phong media bằng chữ ký số + trang xác thực công khai.

## Chạy

```bash
cd web
npm install
npm run dev
# mở http://localhost:3000
```

Không cần cấu hình gì cho M1 — app tự sinh khoá ký Ed25519 và lưu dữ liệu vào `.data/` (đã gitignore).

## Luồng M1 (thử end-to-end)

1. `/upload` → chọn video/ảnh, điền tên shop + mô tả → **Niêm phong**.
2. Server: băm SHA-256 → ký Ed25519 lên payload chuẩn hoá → lưu bản gốc bất biến → trả mã `XXXX-XXXX`.
3. `/v/<mã>` → trang xác thực: media + khối **Nền tảng đảm bảo** + **Kiểm tra dấu niêm phong** (tự verify) + danh tính shop + lời người bán (tách bạch) + disclaimer.

## API

| Route | Việc |
|---|---|
| `POST /api/seal` | Nhận media (multipart) → băm + ký + lưu → `{ code, url }` |
| `GET /api/verify/[code]` | Băm lại media, kiểm chữ ký → phán quyết `intact`/`tampered` |
| `GET /api/media/[code]` | Phát media gốc đã niêm phong |
| `GET /api/pubkey` | Công khai khoá công để kiểm độc lập |

## Mô hình niềm tin (M1 = nấc "chain of custody")

- Chứng minh: **media không bị sửa sau khi rời app** (băm + ký + timestamp server).
- KHÔNG chứng minh: media đến từ camera thật (trần cứng của PWA) hay hàng thật/giả.
- Định vị đúng: *"bằng chứng quay thật, không cắt ghép"* — giữ chặt disclaimer.

## Lưu trữ: hai chế độ (local / Supabase)

App tự chọn driver theo env (`src/lib/store.ts`):

- **Local** (mặc định, dev): filesystem `.data/`. Zero-config. KHÔNG bền trên serverless.
- **Supabase** (production): bật khi có đủ `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
  Metadata → Postgres (`public.proofs`); media → Storage bucket `media` (private, phát qua server).

### Bật Supabase (production)

1. Tạo project ở [supabase.com](https://supabase.com).
2. **SQL Editor** → chạy toàn bộ `supabase/schema.sql` (tạo bảng `proofs` + bucket `media`, bật RLS).
3. **Project Settings → API**: lấy `Project URL` và `service_role` key.
4. Sinh khoá ký cố định: `npm run genkey` → dán 3 dòng in ra vào env.
5. Đặt env (Vercel → Environment Variables, hoặc `.env.local` để test):
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...      # BÍ MẬT
   SIGNING_KEY_ID=...
   SIGNING_PRIVATE_KEY_PEM="...\n..." # BÍ MẬT
   SIGNING_PUBLIC_KEY_PEM="...\n..."
   ```
6. Deploy. App tự chuyển sang driver Supabase.

> **Chốt an toàn:** khi đã cấu hình Supabase mà thiếu `SIGNING_*_PEM`, app báo lỗi thay vì tự sinh khoá — tránh việc mỗi cold start ra khoá khác làm mọi chữ ký cũ vỡ.

## Còn lại để hoàn thiện production

| Thành phần | Hiện tại | Bước sau |
|---|---|---|
| Phát video | qua server (same-origin) | Mux (transcode + adaptive) |
| Auth/shop | tên shop nhập tay | Supabase Auth + bảng shop, uy tín theo shopId |
| Liveness | chưa có | mã liveness + đối chiếu |

## Cấu trúc

```
web/src/
├── lib/
│   ├── seal.ts     # khoá, băm SHA-256, ký/kiểm Ed25519, canonical string
│   ├── store.ts    # lớp lưu trữ (đường nối tới Supabase/Mux)
│   └── util.ts     # sinh mã, liveness code, định dạng
└── app/
    ├── page.tsx            # trang chủ
    ├── upload/page.tsx     # harness thử M1 (M2 thay bằng camera)
    ├── v/[code]/           # trang xác thực + SealCheck
    └── api/                # seal, verify, media, pubkey
```
