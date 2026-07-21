import type { Metadata } from 'next';
import Link from 'next/link';
import RevokeButton from './RevokeButton';

export const metadata: Metadata = {
  title: 'Chính sách quyền riêng tư — Ảnh Thật',
  description: 'Ảnh Thật thu thập gì, dùng để làm gì, và bạn có quyền gì.',
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="brandline">
        <img src="/logo-mark.png" alt="Ảnh Thật" className="brand-logo" />
        <span className="brandname">
          Ảnh <b>Thật</b>
        </span>
      </div>

      <h1 className="title">Quyền riêng tư</h1>
      <p className="muted">
        Trang này nói thẳng: chúng tôi thu gì, để làm gì, và bạn tắt bằng cách nào.
      </p>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'normal', fontSize: 19 }}>
          Lựa chọn của bạn
        </h2>
        <RevokeButton />
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'normal', fontSize: 19 }}>
          Chúng tôi thu thập gì
        </h2>
        <p className="muted">Chỉ khi bạn bấm “Đồng ý”, và chỉ những thứ sau:</p>
        <ul className="muted" style={{ paddingLeft: 20 }}>
          <li>Địa chỉ IP và loại trình duyệt/thiết bị (User-Agent).</li>
          <li>
            Cookie quảng cáo của Meta (<code>_fbp</code>, <code>_fbc</code>) nếu trình duyệt bạn có.
          </li>
          <li>Mã album bạn đang xem và ngành hàng của album đó.</li>
        </ul>
        <p className="muted">
          <b>Chúng tôi KHÔNG thu email, số điện thoại hay tên của người xem.</b> Không bao giờ.
        </p>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'normal', fontSize: 19 }}>
          Dùng để làm gì
        </h2>
        <ul className="muted" style={{ paddingLeft: 20 }}>
          <li>Đo lường: biết có bao nhiêu lượt xem bằng chứng, thuộc ngành hàng nào.</li>
          <li>
            Tiếp thị lại (remarketing): hiển thị quảng cáo phù hợp hơn cho bạn trên nền tảng của
            Meta (Facebook, Instagram).
          </li>
        </ul>
        <p className="muted">
          Dữ liệu được gửi tới Meta Platforms qua Conversions API. Chúng tôi không bán dữ liệu cho
          bên thứ ba nào khác.
        </p>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'normal', fontSize: 19 }}>
          Quyền của bạn
        </h2>
        <ul className="muted" style={{ paddingLeft: 20 }}>
          <li>
            <b>Từ chối ngay từ đầu</b> — nút “Từ chối” trên dải hỏi đồng ý. Nội dung bằng chứng vẫn
            hiển thị đầy đủ, không bị che hay giới hạn.
          </li>
          <li>
            <b>Rút lại bất cứ lúc nào</b> — nút ở đầu trang này.
          </li>
          <li>Yêu cầu biết chúng tôi giữ gì về bạn, hoặc yêu cầu xoá.</li>
        </ul>
        <p className="muted">
          Theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 (hiệu lực 01/01/2026). Cần hỗ trợ, liên
          hệ qua kênh chăm sóc của Ảnh Thật.
        </p>
      </section>

      <section style={{ marginTop: 26 }}>
        <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 'normal', fontSize: 19 }}>
          Lưu vết đồng ý
        </h2>
        <p className="muted">
          Khi bạn bấm đồng ý hoặc từ chối, chúng tôi ghi lại thời điểm và lựa chọn để chứng minh đã
          xin phép. IP trong nhật ký này được <b>băm một chiều</b>, không lưu ở dạng gốc.
        </p>
      </section>

      <div className="vp-foot" style={{ marginTop: 34 }}>
        <Link href="/">← Về trang chủ Ảnh Thật</Link>
      </div>
    </main>
  );
}