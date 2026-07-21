'use client';

/**
 * ConsentBanner — dải hỏi đồng ý mỏng ở đáy trang + nạp Meta Pixel CHỈ sau khi
 * người dùng bấm "Đồng ý".
 *
 * Ràng buộc bất biến:
 * - KHÔNG bắn bất kỳ event nào trước khi có consent.
 * - KHÔNG gate nội dung: ảnh/video bằng chứng luôn hiện, banner chỉ nằm dưới cùng.
 * - Hai nút ngang hàng nhau, không dark pattern.
 */

import { useEffect, useState } from 'react';
import { CONSENT_MAX_AGE, type Consent } from '@/lib/consent';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;

/** Nạp base code của Meta Pixel — chỉ gọi khi đã có consent VÀ có pixel id. */
function loadFbq() {
  if (typeof window === 'undefined' || !PIXEL_ID || (window as any).fbq) return;
  /* eslint-disable */
  (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
    if (f.fbq) return;
    n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
    };
    if (!f._fbq) f._fbq = n;
    n.push = n;
    n.loaded = true;
    n.version = '2.0';
    n.queue = [];
    t = b.createElement(e);
    t.async = true;
    t.src = v;
    s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s);
  })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  /* eslint-enable */
  (window as any).fbq('init', PIXEL_ID);
}

function fireViewContent(eventId: string, code: string, category?: string) {
  const fbq = (window as any).fbq;
  if (!fbq) return;
  fbq(
    'track',
    'ViewContent',
    { content_category: category, content_ids: [code], content_type: 'product' },
    { eventID: eventId }, // ← CÙNG eventId với server để Meta gộp làm 1
  );
}

/** Ghi nhật ký consent (bằng chứng đã xin phép). Lỗi thì bỏ qua, không cản người dùng. */
function logConsent(state: 'granted' | 'denied') {
  fetch('/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
    keepalive: true,
  }).catch(() => {});
}

export default function ConsentBanner({
  initialConsent,
  eventId,
  code,
  category,
}: {
  initialConsent: Consent;
  eventId: string;
  code: string;
  category?: string;
}) {
  const [show, setShow] = useState(initialConsent === 'unset');

  // Đã đồng ý từ trước → nạp pixel + bắn client.
  // (Server đã bắn ở render với cùng eventId → Meta dedup.)
  useEffect(() => {
    if (initialConsent !== 'granted') return;
    loadFbq();
    fireViewContent(eventId, code, category);
  }, [initialConsent, eventId, code, category]);

  function setCookie(val: 'granted' | 'denied') {
    // Secure chỉ hợp lệ trên https — thêm vô điều kiện sẽ làm hỏng dev trên http://localhost.
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `at_consent=${val}; path=/; max-age=${CONSENT_MAX_AGE}; SameSite=Lax${secure}`;
  }

  function accept() {
    setCookie('granted');
    setShow(false);
    logConsent('granted');
    loadFbq();
    fireViewContent(eventId, code, category); // client
    // Server bắn cho CHÍNH lượt xem này (cùng eventId → dedup).
    // Đây là đường bắn chính: lần đầu mở link từ chat thì lúc render chưa có cookie.
    fetch('/api/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, code, category }),
      keepalive: true,
    }).catch(() => {});
  }

  function decline() {
    setCookie('denied');
    setShow(false);
    logConsent('denied');
  }

  if (!show) return null;

  return (
    <>
      {/* Chừa chỗ để dải cố định không che mất phần cuối nội dung. */}
      <div style={{ height: 92 }} aria-hidden />

      <div className="consent-bar" role="dialog" aria-label="Lựa chọn về cookie">
        <span className="consent-text">
          Ảnh Thật dùng cookie để đo lường và cải thiện trải nghiệm. Bạn có thể từ chối.{' '}
          <a href="/privacy">Chính sách</a>
        </span>
        <div className="consent-actions">
          <button className="consent-btn" onClick={decline}>
            Từ chối
          </button>
          <button className="consent-btn primary" onClick={accept}>
            Đồng ý
          </button>
        </div>
      </div>
    </>
  );
}