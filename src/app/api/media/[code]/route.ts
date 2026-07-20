import { getProof, readMedia } from '@/lib/store';

export const runtime = 'nodejs';

/** Phát media gốc đã niêm phong. M2/M3 sẽ chuyển sang signed URL của Mux/R2. */
export async function GET(_req: Request, { params }: { params: { code: string } }) {
  const proof = getProof(params.code);
  if (!proof) {
    return new Response('Không tìm thấy media.', { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = readMedia(proof);
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
