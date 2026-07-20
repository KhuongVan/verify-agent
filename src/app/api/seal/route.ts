import { NextRequest, NextResponse } from 'next/server';
import { sha256Hex, sign, type SealedFacts } from '@/lib/seal';
import { saveProof, type Proof } from '@/lib/store';
import { extFromMime, newCode } from '@/lib/util';

// Cần Node runtime: dùng node:crypto và node:fs.
export const runtime = 'nodejs';

const MAX_BYTES = 100 * 1024 * 1024; // 100MB (M1)
const ALLOWED = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Yêu cầu không hợp lệ (cần multipart/form-data).' }, { status: 400 });
  }

  const file = form.get('media');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Thiếu file media để niêm phong.' }, { status: 400 });
  }

  // MediaRecorder trả mime kèm codecs, ví dụ "video/webm;codecs=vp9,opus" -> lấy phần gốc.
  const mimeType = (file.type || 'application/octet-stream').split(';')[0].trim();
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json(
      { error: `Định dạng chưa hỗ trợ: ${mimeType}. Chấp nhận mp4/webm/mov, jpg/png/webp.` },
      { status: 415 },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    return NextResponse.json({ error: 'File rỗng.' }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: 'File vượt 100MB (giới hạn M1).' }, { status: 413 });
  }

  // ---- Chuỗi niêm phong ----
  const code = newCode();
  const sha256 = sha256Hex(bytes);
  const sealedAt = new Date().toISOString();
  const facts: SealedFacts = { code, sha256, sizeBytes: bytes.length, mimeType, sealedAt };
  const { signatureB64, keyId } = sign(facts);

  // Thông tin client tự khai (KHÔNG ký) — hiển thị tách bạch trên trang xác thực.
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === 'string' && v.trim() ? v.trim() : undefined;
  };

  const proof: Proof = {
    code,
    mimeType,
    ext: extFromMime(mimeType),
    sizeBytes: bytes.length,
    sha256,
    sealedAt,
    signatureB64,
    keyId,
    sellerNote: str('note'),
    clientCapturedAt: str('capturedAt'),
    clientLocation: str('location'),
    livenessCode: str('livenessCode'),
    shopName: str('shopName') ?? 'Shop demo',
  };

  saveProof(proof, bytes);

  return NextResponse.json({ code, url: `/v/${code}` }, { status: 201 });
}
