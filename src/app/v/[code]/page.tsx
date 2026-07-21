import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { waitUntil } from '@vercel/functions';
import ConsentBanner from '@/components/ConsentBanner';
import { getConsent } from '@/lib/consent-server';
import { resolveFbc, sendMetaEvent } from '@/lib/meta-capi';
import { countByShop, getAlbum } from '@/lib/store';
import { formatVN } from '@/lib/util';
import Gallery, { type Slide } from './Gallery';
import SealCheck from './SealCheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const album = await getAlbum(params.code);
  if (!album) return { title: 'Không tìm thấy bằng chứng — Ảnh Thật' };
  return {
    title: `Bằng chứng quay thật · ${album.code} — Ảnh Thật`,
    description: 'Ảnh/video được xác thực quay thật, không cắt ghép.',
  };
}

export default async function VerifyPage({
  params,
  searchParams,
}: {
  params: { code: string };
  searchParams: { [k: string]: string | string[] | undefined };
}) {
  const album = await getAlbum(params.code);
  if (!album) notFound();

  // --- Tracking (chỉ khi ĐÃ đồng ý) -------------------------------------
  // eventId sinh MỘT lần ở server, dùng chung cho cả server lẫn client pixel
  // để Meta dedup — nếu không, một lượt xem bị đếm hai lần.
  const consent = await getConsent();
  const eventId = randomUUID();

  if (consent === 'granted') {
    const h = headers();
    const c = cookies();
    const fbclid = searchParams.fbclid;
    const host = h.get('host');

    // waitUntil: gửi CAPI sau khi response đã trả, nhưng vẫn giữ hàm sống.
    // Next 14 chưa có after() của next/server; fetch fire-and-forget trần sẽ bị
    // serverless đóng băng giữa chừng và mất event.
    waitUntil(
      sendMetaEvent({
        eventId,
        sourceUrl: `https://${host}/v/${params.code}`,
        ip: h.get('x-forwarded-for')?.split(',')[0]?.trim(),
        userAgent: h.get('user-agent') ?? undefined,
        fbp: c.get('_fbp')?.value,
        fbc: resolveFbc(c.get('_fbc')?.value, typeof fbclid === 'string' ? fbclid : undefined),
        category: album.categoryId,
        contentId: params.code,
      }),
    );
  }
  // ----------------------------------------------------------------------

  const shopName = album.shopName ?? 'Shop demo';
  const shopCount = await countByShop(shopName);
  const avatar = shopName.trim().charAt(0).toUpperCase() || 'S';
  const nPhoto = album.items.filter((i) => i.kind === 'photo').length;
  const nVideo = album.items.filter((i) => i.kind === 'video').length;

  const slides: Slide[] = album.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    src: `/api/media/${album.code}/${i.id}`,
  }));

  return (
    <main className="page">
      <div className="vp-hero">
        <img src="/logo-mark.png" alt="Ảnh Thật" className="brand-logo lg" />
        <h2>Bằng chứng quay thật</h2>
        <div className="status">Đã xác minh · Không cắt ghép</div>
      </div>

      <Gallery slides={slides} />

      <section className="block machine">
        <div className="blk-label">🔒 Nền tảng đảm bảo</div>
        <div className="fact">
          <span className="fic">🕒</span>
          <div>
            <b>Niêm phong lúc {formatVN(album.sealedAt)}</b>
            <span>Đóng dấu thời gian bởi máy chủ khi nhận — không thể chỉnh sửa.</span>
          </div>
        </div>
        <div className="fact">
          <span className="fic">✓</span>
          <div>
            <b>
              {album.items.length} mục, mỗi mục niêm phong riêng bằng chữ ký số
            </b>
            <span>
              {nPhoto > 0 && `${nPhoto} ảnh`}
              {nPhoto > 0 && nVideo > 0 && ' · '}
              {nVideo > 0 && `${nVideo} video`}. Chỉ 1 byte bị đổi, dấu của mục đó sẽ vỡ.
            </span>
          </div>
        </div>
        <div style={{ padding: '0 15px 14px' }}>
          <SealCheck code={album.code} />
        </div>
      </section>

      <div className="shopid">
        <div className="av">{avatar}</div>
        <div>
          <div className="nm">
            {shopName} <span className="chk">✓</span>
          </div>
          <div className="st">{shopCount} album đã xác thực trên Ảnh Thật</div>
        </div>
      </div>

      {(album.sellerNote || album.clientLocation) && (
        <section className="seller">
          <div className="blk-label">📝 Người bán mô tả</div>
          <div className="body">
            {album.sellerNote && <p style={{ margin: '0 0 8px' }}>“{album.sellerNote}”</p>}
            {album.clientLocation && (
              <p style={{ margin: 0, color: 'var(--ink-mute)', fontSize: 12 }}>
                Vị trí tự khai: {album.clientLocation}
              </p>
            )}
          </div>
        </section>
      )}

      <div className="disclaimer">
        <span className="ic">ⓘ</span>
        <p>
          <b>Ảnh Thật xác thực media được quay thật, không cắt ghép.</b> Nền tảng không thẩm định
          hàng thật/giả — đây là bằng chứng quay trực tiếp, không phải giấy chứng nhận chính hãng.
        </p>
      </div>

      <div className="vp-foot">
        Bảo vệ &amp; xác thực bởi <span className="lg">Ảnh Thật</span> · mã {album.code}
      </div>

      {/* Dải hỏi đồng ý — đặt cuối, KHÔNG gate nội dung phía trên. */}
      <ConsentBanner
        initialConsent={consent}
        eventId={eventId}
        code={album.code}
        category={album.categoryId}
      />
    </main>
  );
}
