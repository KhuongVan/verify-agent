import { getMediaBytes, getProof } from '@/lib/store';

export const runtime = 'nodejs';

/**
 * Phát media gốc đã niêm phong (same-origin, qua server) — nhờ vậy bucket Storage
 * để PRIVATE. Tối ưu sau (Mux/signed URL) là bước riêng.
 */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const proof = await getProof(params.code);
  if (!proof) {
    return new Response('Không tìm thấy media.', { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await getMediaBytes(proof);
  } catch {
    return new Response('Không đọc được media.', { status: 500 });
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': proof.mimeType,
      'Content-Length': String(proof.sizeBytes),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
