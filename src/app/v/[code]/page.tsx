import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { waitUntil } from '@vercel/functions';
import ConsentBanner from '@/components/ConsentBanner';
import { getConsent } from '@/lib/consent-server';
import { resolveFbc, sendMetaEvent } from '@/lib/meta-capi';
import { verify, type SealedFacts } from '@/lib/seal';
import { getAlbum } from '@/lib/store';
import { formatVN, mediaUrl } from '@/lib/util';
import Gallery, { type Slide } from './Gallery';
import PendingWatcher from './PendingWatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const album = await getAlbum(params.code);
  if (!album) return { title: 'Không tìm thấy bằng chứng — Ảnh Thật' };
  return {
    title: `Thấy thật trước khi mua · ${album.code} — Ảnh Thật`,
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

  // Album vừa đặt mã, ảnh chưa upload xong (người bán vừa chia sẻ link). Hiện
  // "đang tải" + tự làm mới; KHÔNG track/verify khi chưa có item (tránh đếm 2 lần
  // vì trang sẽ reload khi ready).
  if (album.items.length === 0) {
    return (
      <main className="vp">
        <header className="vp-bar">
          <Link href="/" className="vp-brand" aria-label="Ảnh Thật — về trang chụp">
            <img src="/logo-mark.png" alt="" className="brand-logo" />
            <span>Ảnh Thật</span>
          </Link>
          <span className="vp-bar-tag">Thấy thật trước khi mua</span>
        </header>
        <div className="vp-pending">
          <span className="spin" aria-hidden />
          <b>Đang tải ảnh…</b>
          <span>Người bán vừa gửi, ảnh đang lên máy chủ. Trang sẽ tự hiện khi xong.</span>
        </div>
        <PendingWatcher code={album.code} />
      </main>
    );
  }

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

  /**
   * Trạng thái dấu hiển thị ngay khi mở trang: chỉ kiểm CHỮ KÝ (rẻ, không phải
   * tải media về). Kiểm đầy đủ — băm lại từng file rồi đối chiếu — nằm ở nút
   * "Kiểm tra dấu xác minh" bên dưới, vì nó tốn băng thông.
   */
  const signaturesOk = album.items.every((i) => {
    const facts: SealedFacts = {
      code: album.code,
      itemId: i.id,
      sha256: i.sha256,
      sizeBytes: i.sizeBytes,
      mimeType: i.mimeType,
      sealedAt: album.sealedAt,
    };
    return verify(facts, i.signatureB64);
  });

  // Media tải THẲNG từ R2 (custom domain) -> egress miễn phí, không qua Vercel.
  const slides: Slide[] = album.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    src: mediaUrl(album.code, i),
  }));

  return (
    <main className="vp">
      <header className="vp-bar">
        {/* Bấm vào là sang màn chụp — người mua xem xong có thể tự dùng Ảnh Thật. */}
        <Link href="/" className="vp-brand" aria-label="Ảnh Thật — về trang chụp">
          <img src="/logo-mark.png" alt="" className="brand-logo" />
          <span>Ảnh Thật</span>
        </Link>
        <span className="vp-bar-tag">Thấy thật trước khi mua</span>
      </header>

      <Gallery slides={slides} />

      <div className={`vp-verdict${signaturesOk ? '' : ' bad'}`}>
        <span className="vp-verdict-ic" aria-hidden>
          {signaturesOk ? '✓' : '!'}
        </span>
        <div>
          <b>{signaturesOk ? 'Đã xác minh · Không cắt ghép' : 'Dấu xác minh có vấn đề'}</b>
          <span>
            {signaturesOk
              ? 'Hình ảnh/video được chụp/quay trực tiếp từ app, không chọn từ thư viện có sẵn.'
              : 'Chữ ký không khớp. Hãy bấm kiểm tra bên dưới để xem chi tiết.'}
          </span>
        </div>
      </div>

      <div className="vp-facts">
        <div className="vp-fact">
          <span className="k">Xác minh lúc</span>
          <span className="v">{formatVN(album.sealedAt)}</span>
        </div>
        <div className="vp-fact">
          <span className="k">Mã xác minh</span>
          <span className="v">{album.code}</span>
        </div>
        <div className="vp-fact">
          <span className="k">Trạng thái dấu</span>
          <span className={`v state${signaturesOk ? '' : ' bad'}`}>
            {signaturesOk ? 'Nguyên vẹn' : 'Cần kiểm tra'}
          </span>
        </div>
      </div>

      {(album.sellerNote || album.clientLocation) && (
        <section className="vp-note">
          <div className="vp-label">Mô tả từ người bán</div>
          {album.sellerNote && <p>{album.sellerNote}</p>}
          {album.clientLocation && <p className="quiet">Vị trí tự khai: {album.clientLocation}</p>}
        </section>
      )}

      <div className="vp-disclaimer">
        <span className="ic" aria-hidden>
          ⓘ
        </span>
        <p>Đây là bằng chứng quay trực tiếp, không phải giấy chứng nhận hàng thật/giả.</p>
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