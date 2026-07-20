import Link from 'next/link';

export default function Home() {
  return (
    <main className="page">
      <div className="brandline">
        <div className="mark">🔒</div>
        <div className="brandname">
          Nguyên<b>Bản</b>
        </div>
      </div>

      <h1 className="title">Bằng chứng quay thật, không cắt ghép</h1>
      <p className="muted">
        Quay sản phẩm trực tiếp trong app, server niêm phong bằng chữ ký số Ed25519 và sinh trang xác
        thực công khai để gửi cho khách.
      </p>

      <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' }}>
        <Link className="btn" href="/upload">
          📷 Quay & niêm phong →
        </Link>
        <a className="btn ghost" href="/api/pubkey">
          Xem khoá công khai
        </a>
      </div>

      <div className="notice" style={{ marginTop: 28 }}>
        <b>Trạng thái:</b> M1 lưu tạm bằng filesystem (<code>.data/</code>) và tự sinh khoá ký. Đây là
        stand-in cho Supabase + Mux + KMS ở M2/M3 — chữ ký các hàm store đã tách sẵn để thay không đau.
      </div>
    </main>
  );
}
