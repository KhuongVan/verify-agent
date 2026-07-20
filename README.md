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

## Các "đường nối" để lên production (M2+)

| Thành phần | M1 (stand-in) | Production |
|---|---|---|
| Lưu metadata | `.data/proofs.json` | Supabase (Postgres) |
| Lưu media | filesystem `.data/media/` | Mux (video) / R2 (ảnh), signed URL |
| Khoá ký | tự sinh `.data/signing-key.json` | KMS / secret manager (env `SIGNING_*_PEM`) |
| Capture | `/upload` (file input) | Camera trong app + chặn thư viện + liveness |
| Auth/shop | tên shop nhập tay | Supabase Auth + bảng shop |

Chỉ cần giữ nguyên chữ ký các hàm trong `src/lib/store.ts` là thay hạ tầng không phải sửa phần còn lại.

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
