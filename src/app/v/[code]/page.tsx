import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { countByShop, getProof } from '@/lib/store';
import { formatBytes, formatVN, isVideo } from '@/lib/util';
import SealCheck from './SealCheck';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: { code: string } }): Promise<Metadata> {
  const proof = await getProof(params.code);
  if (!proof) return { title: 'Không tìm thấy bằng chứng — Nguyên Bản' };
  return {
    title: `Bằng chứng quay thật · ${proof.code} — Nguyên Bản`,
    description: 'Video được xác thực quay thật, không cắt ghép.',
  };
}

export default async function VerifyPage({ params }: { params: { code: string } }) {
  const proof = await getProof(params.code);
  if (!proof) notFound();

  const shopName = proof.shopName ?? 'Shop demo';
  const shopCount = await countByShop(shopName);
  const avatar = shopName.trim().charAt(0).toUpperCase() || 'S';

  return (
    <main className="page">
      {/* Header niêm phong (do nền tảng đảm bảo) */}
      <div className="vp-hero">
        <div className="vp-seal">🔒</div>
        <h2>Bằng chứng quay thật</h2>
        <div className="status">Đã xác minh · Không cắt ghép</div>
      </div>

      {/* Media gốc đã niêm phong */}
      <div className="vp-video">
        {isVideo(proof.mimeType) ? (
          <video src={`/api/media/${proof.code}`} controls playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/media/${proof.code}`} alt={`Media ${proof.code}`} />
        )}
      </div>

      {/* Khối "NỀN TẢNG ĐẢM BẢO" — máy chứng minh, bất biến */}
      <section className="block machine">
        <div className="blk-label">🔒 Nền tảng đảm bảo</div>
        <div className="fact">
          <span className="fic">🕒</span>
          <div>
            <b>Niêm phong lúc {formatVN(proof.sealedAt)}</b>
            <span>Đóng dấu thời gian bởi máy chủ khi nhận — không thể chỉnh sửa.</span>
          </div>
        </div>
        <div className="fact">
          <span className="fic">✓</span>
          <div>
            <b>Chưa qua chỉnh sửa — niêm phong bằng chữ ký số</b>
            <span>
              Chỉ 1 byte của media bị đổi, chữ ký sẽ vỡ. {formatBytes(proof.sizeBytes)} ·{' '}
              {proof.mimeType}
            </span>
          </div>
        </div>
        <div style={{ padding: '0 15px 14px' }}>
          <SealCheck code={proof.code} />
        </div>
      </section>

      {/* Danh tính shop (uy tín tích luỹ) */}
      <div className="shopid">
        <div className="av">{avatar}</div>
        <div>
          <div className="nm">
            {shopName} <span className="chk">✓</span>
          </div>
          <div className="st">{shopCount} media đã xác thực trên Nguyên Bản</div>
        </div>
      </div>

      {/* Lời người bán tự khai — tách bạch, nền xám */}
      {(proof.sellerNote || proof.clientLocation) && (
        <section className="seller">
          <div className="blk-label">📝 Người bán mô tả</div>
          <div className="body">
            {proof.sellerNote && <p style={{ margin: '0 0 8px' }}>“{proof.sellerNote}”</p>}
            {proof.clientLocation && (
              <p style={{ margin: 0, color: 'var(--ink-mute)', fontSize: 12 }}>
                Vị trí tự khai: {proof.clientLocation}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Disclaimer — thành thật về giới hạn (tăng độ tin cậy) */}
      <div className="disclaimer">
        <span className="ic">ⓘ</span>
        <p>
          <b>Nguyên Bản xác thực media được quay thật, không cắt ghép.</b> Nền tảng không thẩm định
          hàng thật/giả — đây là bằng chứng quay trực tiếp, không phải giấy chứng nhận chính hãng.
        </p>
      </div>

      <div className="vp-foot">
        Bảo vệ &amp; xác thực bởi <span className="lg">Nguyên Bản</span> · mã {proof.code}
      </div>
    </main>
  );
}
