'use client';

import { useState } from 'react';

type VerifyResult = {
  verdict: 'intact' | 'tampered';
  total: number;
  intactCount: number;
  keyId: string | null;
};

/**
 * "Kiểm tra dấu niêm phong" — khách tự verify cả album, không cần tin người bán.
 * Hiển thị kết quả tiếng Việt dễ hiểu; chi tiết kỹ thuật giấu cho người rành.
 */
export default function SealCheck({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (data || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/verify/${code}`);
      const json = await res.json();
      if (!res.ok) setError(json.error || 'Không kiểm được.');
      else setData(json);
    } catch {
      setError('Không kết nối được máy chủ.');
    } finally {
      setLoading(false);
    }
  }

  const ok = data?.verdict === 'intact';

  return (
    <div>
      <button className="seal-check" onClick={toggle} aria-expanded={open}>
        🔍 {open ? 'Ẩn chi tiết niêm phong' : 'Kiểm tra dấu niêm phong'}
      </button>

      {open && (
        <div className="seal-detail">
          {loading && <div>Đang đối chiếu chữ ký…</div>}
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {data && (
            <>
              <div className="row">
                <span>Kết quả</span>
                <span style={{ color: ok ? 'var(--verify)' : 'var(--danger)', fontWeight: 600 }}>
                  {ok ? '✓ Nguyên vẹn' : '✕ Có mục bị can thiệp'}
                </span>
              </div>
              <div className="row">
                <span>Số mục nguyên vẹn</span>
                <span style={{ fontWeight: 600 }}>
                  {data.intactCount}/{data.total}
                </span>
              </div>
              {data.keyId && (
                <div className="row">
                  <span>Khoá ký (keyId)</span>
                  <code>{data.keyId}</code>
                </div>
              )}
              <p style={{ margin: '10px 0 0', fontSize: 11 }}>
                Bạn không cần tin lời người bán — hệ thống tự băm lại từng ảnh/video và đối chiếu với
                chữ ký gốc lưu tại Ảnh Thật.
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--ink-mute)' }}>
                Dành cho người rành kỹ thuật:{' '}
                <a href="/api/pubkey" target="_blank" rel="noreferrer">
                  khoá công khai để tự kiểm độc lập ↗
                </a>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
