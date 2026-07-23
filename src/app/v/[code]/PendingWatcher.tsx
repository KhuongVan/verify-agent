'use client';

import { useEffect } from 'react';

/**
 * Poll trạng thái album khi ảnh chưa lên xong (người bán vừa chia sẻ link nhưng
 * upload còn chạy). Khi server báo ready -> tải lại trang để hiện ảnh đầy đủ.
 */
export default function PendingWatcher({ code }: { code: string }) {
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      try {
        const r = await fetch(`/api/album/${code}`, { cache: 'no-store' });
        const j = await r.json();
        if (!stopped && j?.ready) {
          window.location.reload();
          return;
        }
      } catch {
        /* mạng chập chờn — thử lại ở nhịp sau */
      }
      if (!stopped) timer = window.setTimeout(tick, 3000);
    };
    let timer = window.setTimeout(tick, 3000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [code]);

  return null;
}
