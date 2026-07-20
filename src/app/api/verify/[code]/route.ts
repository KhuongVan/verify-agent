import { NextResponse } from 'next/server';
import { canonicalString, sha256Hex, verify, type SealedFacts } from '@/lib/seal';
import { getMediaBytes, getProof } from '@/lib/store';

export const runtime = 'nodejs';

/**
 * Kiểm chứng độc lập: băm LẠI media đang lưu, dựng lại canonical, kiểm chữ ký.
 * Trả về phán quyết để trang xác thực (hoặc bên thứ ba) tự đối chiếu —
 * "đừng tin lời người bán, tự kiểm".
 */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const proof = await getProof(params.code);
  if (!proof) {
    return NextResponse.json({ error: 'Không tìm thấy bằng chứng.' }, { status: 404 });
  }

  let hashMatch = false;
  try {
    const recomputed = sha256Hex(await getMediaBytes(proof));
    hashMatch = recomputed === proof.sha256;
  } catch {
    hashMatch = false;
  }

  const facts: SealedFacts = {
    code: proof.code,
    sha256: proof.sha256,
    sizeBytes: proof.sizeBytes,
    mimeType: proof.mimeType,
    sealedAt: proof.sealedAt,
  };
  const signatureValid = verify(facts, proof.signatureB64);
  const intact = hashMatch && signatureValid;

  return NextResponse.json({
    code: proof.code,
    verdict: intact ? 'intact' : 'tampered',
    checks: {
      signatureValid,
      contentMatches: hashMatch,
      editTraces: intact ? 'none' : 'detected',
    },
    sha256: proof.sha256,
    keyId: proof.keyId,
    sealedAt: proof.sealedAt,
    canonical: canonicalString(facts),
  });
}
