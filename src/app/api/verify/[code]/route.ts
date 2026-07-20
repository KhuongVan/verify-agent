import { NextResponse } from 'next/server';
import { canonicalString, sha256Hex, verify, type SealedFacts } from '@/lib/seal';
import { getAlbum, getItemBytes } from '@/lib/store';

export const runtime = 'nodejs';

/**
 * Kiểm chứng độc lập TỪNG mục trong album: băm lại media, kiểm chữ ký.
 * Trả phán quyết tổng (intact khi mọi mục nguyên vẹn) + chi tiết từng mục.
 */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const album = await getAlbum(params.code);
  if (!album) {
    return NextResponse.json({ error: 'Không tìm thấy bằng chứng.' }, { status: 404 });
  }

  const perItem = await Promise.all(
    album.items.map(async (item) => {
      let contentMatches = false;
      try {
        const recomputed = sha256Hex(await getItemBytes(album.code, item));
        contentMatches = recomputed === item.sha256;
      } catch {
        contentMatches = false;
      }
      const facts: SealedFacts = {
        code: album.code,
        itemId: item.id,
        sha256: item.sha256,
        sizeBytes: item.sizeBytes,
        mimeType: item.mimeType,
        sealedAt: album.sealedAt,
      };
      const signatureValid = verify(facts, item.signatureB64);
      return { id: item.id, intact: contentMatches && signatureValid, signatureValid, contentMatches };
    }),
  );

  const okCount = perItem.filter((p) => p.intact).length;
  const allIntact = okCount === perItem.length;

  return NextResponse.json({
    code: album.code,
    verdict: allIntact ? 'intact' : 'tampered',
    total: perItem.length,
    intactCount: okCount,
    keyId: album.items[0]?.keyId ?? null,
    sealedAt: album.sealedAt,
    items: perItem,
  });
}
