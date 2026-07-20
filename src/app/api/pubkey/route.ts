import { NextResponse } from 'next/server';
import { getKeyId, getPublicKeyPem } from '@/lib/seal';

export const runtime = 'nodejs';

/**
 * Công khai khoá công (public key) để bất kỳ ai cũng kiểm chữ ký độc lập được.
 * Đây là điểm tựa "đừng tin tôi, tự kiểm" — niềm tin neo về domain này.
 */
export async function GET() {
  return NextResponse.json({
    algorithm: 'Ed25519',
    keyId: getKeyId(),
    publicKeyPem: getPublicKeyPem(),
    canonicalScheme: 'nguyenban.v1',
  });
}
