'use client';

import { useState } from 'react';

type VerifyResult = {
  verdict: 'intact' | 'tampered';
  checks: { signatureValid: boolean; contentMatches: boolean; editTraces: string };
  sha256: string;
  keyId: string;
};

/**
 * "Kiểm tra dấu niêm phong" — cho khách tự verify ngay trên trang, không cần tin
 * lời người bán. Gọi API kiểm chứng độc lập và hiển thị kết quả dễ hiểu.
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
      <button
        onClick={toggle}
        style={{
          all: 'unset',
          boxSizing: 'border-box',
          width: '100%',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--verify)',
          border: '1px dashed var(--verify)',
          borderRadius: 9,
          padding: 11,
        }}
        aria-expanded={open}
      >
        🔍 {open ? 'Ẩn chi tiết niêm phong' : 'Kiểm tra dấu niêm phong'}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: '13px 15px',
            borderRadius: 9,
            background: 'var(--card)',
            border: '1px solid var(--verify-line)',
            fontSize: 12.5,
            color: 'var(--ink-soft)',
          }}
        >
          {loading && <div>Đang đối chiếu chữ ký…</div>}
          {error && <div style={{ color: 'var(--danger)' }}>{error}</div>}
          {data && (
            <>
              <Row
                label="Kết quả"
                value={ok ? '✓ Nguyên vẹn' : '✕ Đã bị can thiệp'}
                ok={ok}
              />
              <Row label="Chữ ký số máy chủ" value={data.checks.signatureValid ? '✓ Hợp lệ' : '✕ Sai'} ok={data.checks.signatureValid} />
              <Row label="So khớp nội dung media" value={data.checks.contentMatches ? '✓ Trùng khớp' : '✕ Lệch'} ok={data.checks.contentMatches} />
              <Row label="Dấu vết chỉnh sửa" value={data.checks.editTraces === 'none' ? 'Không phát hiện' : 'Phát hiện'} ok={data.checks.editTraces === 'none'} />
              <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid var(--line-2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
                  <span>SHA-256</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--verify)', wordBreak: 'break-all', textAlign: 'right' }}>
                    {data.sha256.slice(0, 24)}…
                  </code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '3px 0' }}>
                  <span>Khoá ký (keyId)</span>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{data.keyId}</code>
                </div>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: 11 }}>
                Bạn không cần tin lời người bán — hệ thống tự băm lại media và đối chiếu với chữ ký gốc
                lưu tại Nguyên Bản.
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

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        padding: '5px 0',
        borderBottom: '1px solid var(--line-2)',
      }}
    >
      <span>{label}</span>
      <span style={{ color: ok ? 'var(--verify)' : 'var(--danger)', fontWeight: 600 }}>{value}</span>
    </div>
  );
}
