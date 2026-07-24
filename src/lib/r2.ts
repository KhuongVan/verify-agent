import 'server-only';
import { AwsClient } from 'aws4fetch';

/**
 * r2.ts — lưu bytes media trên Cloudflare R2 (tương thích S3).
 *
 * Vì sao R2: egress miễn phí. Khách tải ảnh/video THẲNG từ R2 qua custom domain
 * (xem mediaUrl trong util.ts), không qua Vercel — cắt chi phí băng thông.
 *
 * Metadata album (bảng albums) vẫn ở Supabase Postgres. R2 chỉ giữ bytes.
 * Dùng aws4fetch (~6KB) thay AWS SDK để cold-start nhanh trên serverless.
 */

let cached: { client: AwsClient; base: string } | null = null;

function r2(): { client: AwsClient; base: string } {
  if (cached) return cached;

  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'Thiếu cấu hình R2: cần R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.',
    );
  }

  const client = new AwsClient({ accessKeyId, secretAccessKey, service: 's3', region: 'auto' });
  const base = `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
  cached = { client, base };
  return cached;
}

const objectUrl = (key: string) => `${r2().base}/${key}`;

/** Ghi một object. key = "<code>/<id>.<ext>". */
export async function putObject(key: string, bytes: Buffer, contentType: string): Promise<void> {
  // Ký thành PRESIGNED URL (chữ ký nằm trong query), KHÔNG bọc body qua aws4fetch.
  // Lý do: aws4fetch.fetch() bọc body vào một Request rồi fetch(Request) -> undici
  // đọc body dạng stream -> gửi chunked KHÔNG có Content-Length -> R2 trả 411.
  // PUT thẳng bằng fetch chuẩn với Buffer thì undici tự đặt Content-Length.
  const signed = await r2().client.sign(objectUrl(key), {
    method: 'PUT',
    aws: { signQuery: true },
  });

  const res = await fetch(signed.url, {
    method: 'PUT',
    body: bytes as unknown as BodyInit,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
  if (!res.ok) {
    throw new Error(`R2 PUT lỗi ${res.status}: ${await res.text()}`);
  }
}

/**
 * Ký một PRESIGNED PUT URL để CLIENT tải file THẲNG lên R2 (không qua serverless).
 *
 * Vì sao: route handler trên Vercel giới hạn body ~4.5MB — video Full HD (nhất là
 * mp4/H.264 của iOS) vượt ngưỡng này nên upload qua /api/seal bị chặn. PUT thẳng
 * lên R2 không dính giới hạn đó.
 *
 * Chữ ký nằm trong query (signQuery) nên client chỉ cần fetch(url, {method:'PUT',
 * body}) — KHÔNG cần thêm header xác thực. Content-Type/Cache-Control client tự
 * đặt, không nằm trong chữ ký (giống putObject ở trên). Hết hạn sau `expiresIn` giây.
 */
export async function presignPut(key: string, expiresIn = 600): Promise<string> {
  // X-Amz-Expires nằm trong query (cách chuẩn của SigV4 presigned) và được ký cùng.
  const url = new URL(objectUrl(key));
  url.searchParams.set('X-Amz-Expires', String(expiresIn));
  const signed = await r2().client.sign(url.toString(), {
    method: 'PUT',
    aws: { signQuery: true },
  });
  return signed.url;
}

/** Đọc một object về Buffer (dùng cho verify: server băm lại media). */
export async function getObject(key: string): Promise<Buffer> {
  const res = await r2().client.fetch(objectUrl(key), { method: 'GET' });
  if (!res.ok) {
    throw new Error(`R2 GET lỗi ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/** Xoá nhiều object (rollback khi seal lỗi giữa chừng). Bỏ qua lỗi từng cái. */
export async function deleteObjects(keys: string[]): Promise<void> {
  await Promise.all(
    keys.map((key) =>
      r2()
        .client.fetch(objectUrl(key), { method: 'DELETE' })
        .catch(() => {}),
    ),
  );
}
