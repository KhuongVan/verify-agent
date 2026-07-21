'use client';

/**
 * Nút rút lại đồng ý — quyền bắt buộc theo Luật 91/2025/QH15.
 * Đặt cookie về 'denied' (không xoá cookie: xoá sẽ thành 'unset' và banner hỏi lại,
 * trong khi ý người dùng là TỪ CHỐI).
 */

import { useEffect, useState } from 'react';
import { CONSENT_COOKIE, CONSENT_MAX_AGE, type Consent } from '@/lib/consent';

function readConsent(): Consent {
  const m = document.cookie.match(new RegExp(`(?:^|; )${CONSENT_COOKIE}=([^;]*)`));
  const v = m?.[1];
  return v === 'granted' || v === 'denied' ? v : 'unset';
}

export default function RevokeButton() {
  const [state, setState] = useState<Consent>('unset');
  const [done, setDone] = useState(false);

  useEffect(() => setState(readConsent()), []);

  function revoke() {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${CONSENT_COOKIE}=denied; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
    setState('denied');
    setDone(true);
    fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'denied' }),
      keepalive: true,
    }).catch(() => {});
  }

  const label =
    state === 'granted'
      ? 'Bạn đang ĐỒNG Ý cho đo lường.'
      : state === 'denied'
        ? 'Bạn đang TỪ CHỐI đo lường.'
        : 'Bạn chưa chọn.';

  return (
    <div className="notice" style={{ marginTop: 8 }}>
      <p style={{ margin: '0 0 10px' }}>{label}</p>
      {done ? (
        <p style={{ margin: 0, color: 'var(--verify)' }}>✓ Đã rút lại đồng ý.</p>
      ) : (
        <button className="btn ghost" onClick={revoke} disabled={state === 'denied'}>
          Rút lại đồng ý
        </button>
      )}
    </div>
  );
}