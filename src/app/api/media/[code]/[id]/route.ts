import { getAlbum, getItemBytes } from '@/lib/store';

export const runtime = 'nodejs';

/** Phát media gốc của MỘT mục (same-origin, để bucket Storage có thể private). */
export async function GET(_req: Request, { params }: { params: { code: string; id: string } }) {
  const album = await getAlbum(params.code);
  const item = album?.items.find((i) => i.id === params.id);
  if (!album || !item) {
    return new Response('Không tìm thấy media.', { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await getItemBytes(album.code, item);
  } catch {
    return new Response('Không đọc được media.', { status: 500 });
  }

  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': item.mimeType,
      'Content-Length': String(item.sizeBytes),
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
