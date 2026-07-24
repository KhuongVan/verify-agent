'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import { androidBrowserIntent, detectInApp, iosSafariUrl, type InAppInfo } from '@/lib/inapp';
import { fixInfiniteDuration } from '@/lib/videoDuration';

/**
 * Trang chủ = màn hình chụp kiểu camera điện thoại.
 * Chụp ảnh / quay video trực tiếp (không nhận file thư viện), gom nhiều mục,
 * bấm "Gửi" -> xác minh cả loạt -> trả về một link để gửi khách.
 */

type Facing = 'environment' | 'user';
type Mode = 'photo' | 'video';
type Phase = 'welcome' | 'inapp' | 'init' | 'live' | 'review' | 'done';
type Shot = { id: string; blob: Blob; url: string; kind: Mode };

/** Đã xem màn chào lần nào chưa — người bán quen dùng vào thẳng camera. */
const INTRO_KEY = 'at_seen_intro';

/** Giới hạn tổng dung lượng media mỗi lần tạo link. Khớp MAX_TOTAL_BYTES ở /api/seal. */
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

/** Dung lượng gọn cho người bán: KB dưới 1MB, còn lại MB. */
function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Quyền camera có đang bị CHẶN không (state 'denied' của Permissions API).
 * Chặn ≠ từ chối tạm: khi bị chặn, getUserMedia không hiện popup nữa.
 * Safari iOS không hỗ trợ query 'camera' -> trả false (để không chặn nhầm).
 */
async function isCameraBlocked(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

/** Quy đổi độ phân giải thật của track camera sang nhãn dễ hiểu (theo cạnh ngắn). */
function qualityLabel(width: number, height: number): string {
  const p = Math.min(width, height);
  if (p >= 2160) return '4K';
  if (p >= 1440) return '2K';
  if (p >= 1080) return 'Full HD';
  if (p >= 720) return 'HD';
  return `${p}p`;
}

function pickMime(): string {
  // iOS (mọi trình duyệt đều là WebKit): PHẢI ưu tiên mp4/H.264 — định dạng iOS
  // phát native, có duration chuẩn. iOS đời mới có thể nhận webm khi QUAY nhưng
  // PHÁT lại chập chờn (hiện "Lỗi", thanh tua hỏng) — nên webm chỉ là đường lùi.
  const ios =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const cands = ios
    ? ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export default function CameraHome() {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  const idRef = useRef(0);
  /** Đã xem màn chào chưa (đọc từ localStorage lúc khởi động). */
  const seenIntroRef = useRef(false);
  /** Đang gọi /api/reserve — tránh đặt mã trùng lặp. */
  const reservingRef = useRef(false);
  /** Toạ độ X lúc bắt đầu chạm — để nhận cử chỉ vuốt đổi ảnh ở màn Xem lại. */
  const touchXRef = useRef<number | null>(null);
  /** Khung xem lớn ở màn Xem lại — để tạm dừng các video đang ẩn khi đổi mục. */
  const rvStageRef = useRef<HTMLDivElement>(null);

  const [facing, setFacing] = useState<Facing>('environment');
  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('init');
  // Chờ đọc localStorage xong mới quyết định hiện màn chào hay camera — tránh
  // nháy một khung hình "Đang mở camera…" rồi mới nhảy sang màn chào.
  const [booting, setBooting] = useState(true);
  const [inApp, setInApp] = useState<InAppInfo | null>(null);
  /** Camera "mở được" nhưng không ra hình — màn đen trong webview. */
  const [stalled, setStalled] = useState(false);
  /** Quyền camera đã bị CHẶN (không phải từ chối tạm) — phải mở lại trong cài đặt. */
  const [permBlocked, setPermBlocked] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  /** Nhãn chất lượng của luồng camera hiện tại (vd. "Full HD") — lấy từ track thật, không phải số xin. */
  const [quality, setQuality] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  /** Mục đang xem lớn ở trang "Xem lại". */
  const [previewId, setPreviewId] = useState<string | null>(null);
  /** Mở ảnh toàn màn hình (lightbox) để soi kỹ trước khi gửi. */
  const [zoomed, setZoomed] = useState(false);
  const [result, setResult] = useState<{ code: string; url: string; count: number } | null>(null);
  const [copied, setCopied] = useState(false);
  /** Mã đặt trước (để share() gọi được ngay trong cú bấm, xem createLink). */
  const [reservedCode, setReservedCode] = useState<string | null>(null);
  /** Tiến trình upload ảnh sau khi đã share link. */
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');

  shotsRef.current = shots;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async (want: Facing) => {
    setError(null);
    setPermBlocked(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt không hỗ trợ camera, hoặc trang không chạy trên HTTPS/localhost.');
      return;
    }
    stopStream();
    setQuality(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: want, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      // Thiết bị có thể không đáp ứng đúng 1920x1080 xin ở trên -> đọc số thật từ track.
      const settings = stream.getVideoTracks()[0]?.getSettings();
      if (settings?.width && settings?.height) {
        setQuality(qualityLabel(settings.width, settings.height));
      }
      setPhase('live');
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') {
        // Phân biệt "đã CHẶN vĩnh viễn" với "từ chối tạm lần này": nếu đã chặn thì
        // gọi lại getUserMedia cũng vô ích (không hiện popup), phải vào cài đặt.
        const blocked = await isCameraBlocked();
        if (blocked) {
          setPermBlocked(true);
          setPhase('init'); // vào camera shell để overlay hướng dẫn hiện (kể cả khi bấm từ màn chào)
        } else {
          setError('Bạn chưa cho phép dùng camera. Bấm "Thử lại" và chọn Cho phép.');
        }
      } else if (name === 'NotFoundError') {
        setError('Không tìm thấy camera trên thiết bị.');
      } else if (name === 'NotReadableError') {
        setError('Camera đang bị ứng dụng khác chiếm. Đóng app đó rồi thử lại.');
      } else {
        setError('Không mở được camera. Kiểm tra quyền truy cập và thử lại.');
      }
    }
  }, [stopStream]);

  useEffect(() => {
    // Người mới: KHÔNG mở camera vội. Hỏi quyền trước khi giải thích thì đa số
    // bấm "Chặn" theo phản xạ, mà đã chặn rồi thì phải vào cài đặt mới bật lại.
    let seen = false;
    try {
      seen = localStorage.getItem(INTRO_KEY) === '1';
    } catch {
      seen = false; // trình duyệt chặn storage (chế độ riêng tư) — cứ coi như mới
    }

    // Webview của app nhắn tin chặn camera -> cảnh báo TRƯỚC, đừng để họ cấp
    // quyền xong mới thấy màn đen rồi tưởng app hỏng.
    seenIntroRef.current = seen;
    const info = detectInApp(navigator.userAgent);
    setInApp(info);

    if (info.isInApp) setPhase('inapp');
    else if (seen) startCamera('environment');
    else setPhase('welcome');
    setBooting(false);

    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Đặt trước một MÃ ngay khi người bán vào màn "Xem lại".
   *
   * Mục đích: lúc bấm "Tạo link" đã có sẵn URL để gọi navigator.share() ĐỒNG BỘ
   * trong cú chạm (điều kiện sống còn để share mở được trên iOS). Ảnh CHƯA lên —
   * chỉ giữ mã — nên người bán vẫn xoá/chụp thêm thoải mái, mã không đổi.
   */
  useEffect(() => {
    if (phase !== 'review' || reservedCode || reservingRef.current) return;
    reservingRef.current = true;
    fetch('/api/reserve', { method: 'POST' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j?.code && setReservedCode(j.code))
      .catch(() => {
        /* đặt mã lỗi -> createLink sẽ lùi về đường cũ (server tự sinh mã) */
      })
      .finally(() => {
        reservingRef.current = false;
      });
  }, [phase, reservedCode]);

  // Rời màn Xem lại thì đóng lightbox, tránh nó còn mở khi quay lại lần sau.
  useEffect(() => {
    if (phase !== 'review') setZoomed(false);
  }, [phase]);

  // Khung xem lớn giữ SẴN mọi mục (không tháo/dựng lại khi đổi -> hết giật). Mặt
  // trái: video đang phát mà đổi mục sẽ tiếp tục chạy tiếng dưới nền -> tạm dừng
  // mọi video không phải mục đang xem.
  useEffect(() => {
    if (phase !== 'review') return;
    const stage = rvStageRef.current;
    if (!stage) return;
    const currentId = previewId ?? shots[0]?.id;
    stage.querySelectorAll('video').forEach((v) => {
      if (v.closest('.rv-media')?.getAttribute('data-shot-id') !== currentId) v.pause();
    });
  }, [phase, previewId, shots]);

  // Đóng tab lúc ảnh chưa upload xong sẽ để link dang dở — cảnh báo trước.
  useEffect(() => {
    if (uploadStatus !== 'uploading') return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [uploadStatus]);

  /**
   * Gắn luồng camera vào thẻ <video> NGAY SAU khi thẻ đó có mặt trong DOM.
   *
   * startCamera() có thể chạy lúc màn chào hoặc màn kết quả đang hiển thị — khi
   * ấy <video> chưa được render nên liveRef.current còn null, gán trực tiếp sẽ
   * rơi vào hư không và người dùng chỉ thấy màn đen.
   */
  useEffect(() => {
    const v = liveRef.current;
    const s = streamRef.current;
    if (!v || !s || v.srcObject === s) return;

    v.srcObject = s;
    setStalled(false);
    v.play().catch(() => {});

    /**
     * Bẫy "màn đen câm": webview của app nhắn tin có thể trả về stream hợp lệ
     * nhưng không bao giờ đẩy khung hình nào — getUserMedia KHÔNG báo lỗi, nên
     * đây là cách duy nhất để biết. videoWidth vẫn bằng 0 nghĩa là chưa có hình.
     */
    const onPlaying = () => {
      if (v.videoWidth > 0) setStalled(false);
    };
    v.addEventListener('playing', onPlaying);
    const t = setTimeout(() => setStalled(v.videoWidth === 0), 3500);

    return () => {
      clearTimeout(t);
      v.removeEventListener('playing', onPlaying);
    };
  }, [phase]);

  /**
   * Mở trang hiện tại bằng trình duyệt thật.
   *
   * Android: intent:// — cách chính thức, chạy ổn định.
   * iOS: thử scheme không chính thức x-safari-https:// (xem lib/inapp). Nếu sau
   * ~1,2s trang vẫn còn hiển thị nghĩa là không ăn -> đưa về hướng dẫn thao tác
   * tay. Không thể biết trước có được hay không, nên cứ thử rồi kiểm chứng.
   */
  function openInBrowser() {
    const here = window.location.href;

    if (inApp?.os === 'android') {
      window.location.href = androidBrowserIntent(here);
      return;
    }

    if (inApp?.os === 'ios') {
      let left = false;
      const onHide = () => {
        left = true; // trang bị ẩn đi -> Safari đã mở
      };
      document.addEventListener('visibilitychange', onHide, { once: true });

      window.location.href = iosSafariUrl(here);

      setTimeout(() => {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && document.visibilityState === 'visible') setPhase('inapp');
      }, 1200);
      return;
    }

    setPhase('inapp');
  }

  function beginCapture() {
    try {
      localStorage.setItem(INTRO_KEY, '1');
    } catch {
      /* không lưu được thì lần sau chào lại — không đáng chặn luồng */
    }
    startCamera(facing);
  }

  function addShot(blob: Blob, kind: Mode) {
    const url = URL.createObjectURL(blob);
    setShots((prev) => [...prev, { id: `s${idRef.current++}`, blob, url, kind }]);
  }

  function flip() {
    const next: Facing = facing === 'environment' ? 'user' : 'environment';
    setFacing(next);
    startCamera(next);
  }

  function takePhoto() {
    const video = liveRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setFlash(true);
    setTimeout(() => setFlash(false), 160);
    canvas.toBlob((blob) => blob && addShot(blob, 'photo'), 'image/jpeg', 0.92);
  }

  function startRecording() {
    const stream = streamRef.current;
    if (!stream) return;
    chunksRef.current = [];
    const mime = pickMime();
    let rec: MediaRecorder;
    try {
      rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      setError('Thiết bị không hỗ trợ ghi hình trên trình duyệt này.');
      return;
    }
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'video/webm' });
      addShot(blob, 'video');
    };
    recorderRef.current = rec;
    rec.start();
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= 60) stopRecording();
        return s + 1;
      });
    }, 1000);
  }

  function stopRecording() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  }

  function onShutter() {
    if (mode === 'photo') takePhoto();
    else if (recording) stopRecording();
    else startRecording();
  }

  function removeShot(id: string) {
    const idx = shots.findIndex((x) => x.id === id);
    if (idx < 0) return;
    URL.revokeObjectURL(shots[idx].url);
    const rest = shots.filter((x) => x.id !== id);
    setShots(rest);

    // Xoá hết thì quay lại camera; xoá đúng mục đang xem thì nhảy sang mục kế.
    if (rest.length === 0) {
      setPreviewId(null);
      setPhase('live');
      return;
    }
    if (previewId === id) setPreviewId(rest[Math.min(idx, rest.length - 1)].id);
  }

  /**
   * Bấm "Tạo link". Thứ tự CỐ Ý:
   *   1. share() NGAY — đồng bộ, không await gì trước, để iOS Safari cho mở.
   *   2. Chuyển màn kết quả ngay (ảnh hiện từ blob local).
   *   3. Upload ảnh SAU, không chặn share.
   * Nhờ đã đặt mã trước (reservedCode) nên URL có sẵn ngay ở bước 1.
   */
  function createLink() {
    if (shots.length === 0) return;
    // Chặn ngay ở client nếu vượt 100MB — khỏi tải lên rồi mới bị server từ chối.
    if (shotsRef.current.reduce((n, s) => n + s.blob.size, 0) > MAX_TOTAL_BYTES) {
      setError('Tổng dung lượng vượt 100MB — hãy xoá bớt ảnh/video rồi thử lại.');
      return;
    }
    const code = reservedCode; // có thể null nếu reserve chưa xong / lỗi
    const url = code ? `/v/${code}` : '';

    // (1) Mở bảng chia sẻ ngay trong cú chạm. Không có mã hoặc máy không hỗ trợ
    // thì bỏ qua — người bán vẫn bấm nút "Chia sẻ" ở màn kết quả được.
    if (code && navigator.share) {
      navigator
        .share({ title: 'Ảnh Thật — Thấy thật trước khi mua', url: `${window.location.origin}${url}` })
        .catch(() => {});
    }

    // (2) Sang màn kết quả ngay. LUÔN setResult — kể cả khi chưa có mã đặt trước
    // (reserve chưa xong/lỗi) — để màn kết quả HIỆN thay vì rơi về màn chụp. Mã/URL
    // để rỗng, uploadSealed sẽ điền từ phản hồi server; trong lúc chờ, màn kết quả
    // hiện trạng thái "đang tạo link…".
    stopStream();
    setError(null);
    setResult({ code: code ?? '', url: code ? url : '', count: shots.length });
    setPhase('done');

    // (3) Upload nền.
    void uploadSealed(code);
  }

  /** Upload ảnh + niêm phong. Gắn vào mã đã đặt (nếu có). Cập nhật uploadStatus. */
  async function uploadSealed(code: string | null) {
    setUploadStatus('uploading');
    setError(null);

    // Metadata mỗi mục. id đánh theo THỨ TỰ (i0, i1…) để khớp key R2 server tính.
    const media = shotsRef.current.map((s, i) => ({
      id: `i${i}`,
      blob: s.blob,
      mimeType: s.kind === 'photo' ? 'image/jpeg' : s.blob.type.split(';')[0] || 'video/webm',
    }));

    try {
      // (A) Ưu tiên tải THẲNG lên R2 để không dính giới hạn body ~4.5MB của
      //     serverless (video Full HD/iOS hay vượt). Cần mã đặt trước để tạo key.
      if (code) {
        const urlRes = await fetch('/api/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, items: media.map((m) => ({ id: m.id, mimeType: m.mimeType })) }),
        });
        const urlJson = await urlRes.json().catch(() => null);

        if (urlRes.ok && urlJson?.mode === 'r2') {
          const byId = new Map(media.map((m) => [m.id, m]));
          for (const up of urlJson.uploads as { id: string; url: string }[]) {
            const m = byId.get(up.id);
            if (!m) continue;
            const put = await fetch(up.url, {
              method: 'PUT',
              body: m.blob,
              headers: { 'Content-Type': m.mimeType },
            });
            if (!put.ok) throw new Error(`R2 PUT ${put.status}`);
          }

          // Bytes đã ở R2 — niêm phong chỉ bằng metadata (không kèm file).
          const sealRes = await fetch('/api/seal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              code,
              shopName: shopName.trim() || undefined,
              note: note.trim() || undefined,
              categoryId: categoryId || undefined,
              items: media.map((m) => ({ id: m.id, mimeType: m.mimeType })),
            }),
          });
          const sealJson = await sealRes.json().catch(() => null);
          if (!sealRes.ok) {
            setUploadStatus('error');
            setError(sealJson?.error || 'Lưu ảnh thất bại.');
            return;
          }
          setUploadStatus('ok');
          return;
        }
        // mode === 'local' hoặc lỗi cấp URL -> rơi xuống đường multipart bên dưới.
      }

      // (B) Đường cũ (local/dev, hoặc chưa có mã): gửi bytes qua multipart.
      const data = new FormData();
      for (const m of media) {
        const ext =
          m.mimeType === 'image/jpeg'
            ? 'jpg'
            : m.mimeType === 'video/mp4'
              ? 'mp4'
              : m.mimeType === 'video/quicktime'
                ? 'mov'
                : 'webm';
        data.append('media', new File([m.blob], `${m.id}.${ext}`, { type: m.mimeType }));
      }
      if (code) data.set('code', code);
      if (shopName.trim()) data.set('shopName', shopName.trim());
      if (categoryId) data.set('categoryId', categoryId);
      if (note.trim()) data.set('note', note.trim());

      const res = await fetch('/api/seal', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) {
        setUploadStatus('error');
        setError(json.error || 'Lưu ảnh thất bại.');
        return;
      }
      // Đường không có mã đặt trước: giờ mới biết url/code từ server.
      if (!code) setResult(json);
      setUploadStatus('ok');
    } catch {
      setUploadStatus('error');
      setError('Mất kết nối khi tải ảnh lên.');
    }
  }

  function startNew() {
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    setShots([]);
    setResult(null);
    setShopName('');
    setCategoryId('');
    setNote('');
    setCopied(false);
    setReservedCode(null); // lần album sau đặt mã mới
    setUploadStatus('idle');
    startCamera(facing);
  }

  async function copyLink() {
    if (!result) return;
    const full = `${window.location.origin}${result.url}`;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

  /**
   * Mở bảng chia sẻ của hệ điều hành (Zalo/Messenger...) — đúng việc người bán
   * cần làm ngay sau khi tạo link. Trình duyệt không hỗ trợ thì lùi về chép link.
   */
  async function shareLink() {
    if (!result) return;
    const full = `${window.location.origin}${result.url}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Ảnh Thật — Thấy thật trước khi mua', url: full });
        return;
      } catch {
        return; // người dùng bấm huỷ — không làm gì thêm
      }
    }
    copyLink();
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  // Nền trống trong lúc đọc localStorage — chỉ một khung hình, không chữ nghĩa gì.
  if (booting) return <div className="cam-shell" />;

  // ---- Đang mở trong app nhắn tin: camera sẽ không chạy ----
  if (phase === 'inapp' && inApp) {
    const appLabel = inApp.appName ?? 'ứng dụng này';
    return (
      <main className="intro">
        <div className="intro-card">
          <div className="intro-brand">
            <img src="/logo-mark.png" alt="" className="brand-logo lg" />
            <span>Ảnh Thật</span>
          </div>

          <h1 className="intro-title">Hãy mở bằng trình duyệt</h1>
          <p className="intro-lead">
            Bạn đang mở trong {appLabel}. Để có trải nghiệm tốt nhất hãy mở bằng trình duyệt bạn
            nhé!
          </p>

          <div className="intro-foot" style={{ marginTop: 32 }}>
            {copied && <p className="done-copied">✓ Đã sao chép link</p>}

            {inApp.os === 'android' ? (
              <button className="btn" style={{ width: '100%' }} onClick={openInBrowser}>
                Mở bằng trình duyệt
              </button>
            ) : (
              <>
                <button className="btn" style={{ width: '100%' }} onClick={openInBrowser}>
                  Mở bằng trình duyệt
                </button>
                <button
                  className="btn ghost"
                  style={{ width: '100%', marginTop: 10 }}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(window.location.href);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 3000);
                    } catch {
                      /* clipboard bị chặn — vẫn còn nút "Mở bằng trình duyệt" ở trên */
                    }
                  }}
                >
                  Sao chép link
                </button>
              </>
            )}

            <button
              className="intro-skip"
              onClick={() => {
                setPhase(seenIntroRef.current ? 'init' : 'welcome');
                if (seenIntroRef.current) startCamera('environment');
              }}
            >
              Vẫn tiếp tục ở đây
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---- Màn chào (chỉ hiện lần đầu) ----
  if (phase === 'welcome') {
    return (
      <main className="intro">
        <div className="intro-card">
          <div className="intro-brand">
            <img src="/logo-mark.png" alt="" className="brand-logo lg" />
            <span>Ảnh Thật</span>
          </div>

          <h1 className="intro-title">Thấy thật trước khi mua</h1>

          <ol className="intro-steps">
            <li>
              <span className="n">1</span>
              <div>
                <b>Chụp/quay trực tiếp trong app</b>
                <span>Không lấy ảnh từ thư viện có sẵn.</span>
              </div>
            </li>
            <li>
              <span className="n">2</span>
              <div>
                <b>Hệ thống xác minh và khoá lại</b>
                <span>Đóng dấu thời gian, ký số từng ảnh/video.</span>
              </div>
            </li>
            <li>
              <span className="n">3</span>
              <div>
                <b>Gửi link cho khách</b>
                <span>Khách mở ra tự kiểm được.</span>
              </div>
            </li>
          </ol>

          <div className="intro-foot">
            {error && (
              <div className="notice err" style={{ marginBottom: 12 }}>
                {error}
              </div>
            )}
            <button className="btn" style={{ width: '100%' }} onClick={beginCapture}>
              {error ? 'Thử lại' : 'Bắt đầu chụp'}
            </button>
            <p className="intro-note">Ứng dụng sẽ xin quyền dùng camera ở bước này.</p>
          </div>
        </div>
      </main>
    );
  }

  // ---- Trang xem lại trước khi gửi ----
  if (phase === 'review') {
    const current = shots.find((s) => s.id === previewId) ?? shots[0];
    const curIdx = Math.max(0, shots.findIndex((s) => s.id === current?.id));
    const multi = shots.length > 1;
    const totalBytes = shots.reduce((n, s) => n + s.blob.size, 0);
    const overLimit = totalBytes > MAX_TOTAL_BYTES;
    const goTo = (i: number) => {
      if (i >= 0 && i < shots.length) setPreviewId(shots[i].id);
    };
    const onTouchEnd = (e: React.TouchEvent) => {
      const start = touchXRef.current;
      touchXRef.current = null;
      if (start === null) return;
      const dx = e.changedTouches[0].clientX - start;
      if (Math.abs(dx) > 40) goTo(curIdx + (dx < 0 ? 1 : -1)); // vuốt trái -> ảnh sau
    };

    return (
      <main className="review">
        <header className="rv-bar">
          <button className="rv-back" onClick={() => setPhase('live')} aria-label="Quay lại chụp">
            ←
          </button>
          <h1>Xem lại {shots.length} mục</h1>
          <button className="rv-add" onClick={() => setPhase('live')}>
            + Chụp thêm
          </button>
        </header>

        {/* Khung xem lớn — vuốt hoặc bấm mũi tên để đổi mục. Xoá ở thumbnail dưới.
            ẢNH giữ sẵn mọi mục (chỉ ẩn/hiện) nên đổi ảnh không giật. VIDEO thì CHỈ
            dựng thẻ <video> cho mục ĐANG xem: iOS Safari giới hạn số video tải cùng
            lúc, quá thì các thẻ dư báo "Lỗi" — nên mỗi lúc chỉ 1 video sống. Khung
            cao cố định nên đổi mục vẫn không nhảy layout. */}
        <div
          ref={rvStageRef}
          className="rv-stage"
          onTouchStart={(e) => (touchXRef.current = e.touches[0].clientX)}
          onTouchEnd={onTouchEnd}
        >
          {shots.map((s) => {
            const isCurrent = s.id === current?.id;
            return (
              <div key={s.id} className="rv-media" data-shot-id={s.id} hidden={!isCurrent}>
                {s.kind === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="Mục vừa chụp" onClick={() => setZoomed(true)} />
                ) : isCurrent ? (
                  <video
                    src={s.url}
                    controls
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={fixInfiniteDuration}
                  />
                ) : null}
              </div>
            );
          })}

          {current?.kind === 'photo' && (
            <span className="rv-zoom-hint" aria-hidden>
              ⛶
            </span>
          )}

          {multi && (
            <>
              <button
                className="rv-nav prev"
                onClick={() => goTo(curIdx - 1)}
                disabled={curIdx === 0}
                aria-label="Mục trước"
              >
                ‹
              </button>
              <button
                className="rv-nav next"
                onClick={() => goTo(curIdx + 1)}
                disabled={curIdx === shots.length - 1}
                aria-label="Mục sau"
              >
                ›
              </button>
              <span className="rv-counter">
                {curIdx + 1}/{shots.length}
              </span>
            </>
          )}
        </div>

        {multi && (
          <div className="rv-strip">
            {shots.map((s) => (
              <div
                key={s.id}
                className={`rv-thumb${s.id === current?.id ? ' on' : ''}`}
              >
                <button
                  className="rv-thumb-pick"
                  onClick={() => setPreviewId(s.id)}
                  aria-label={`Xem mục ${s.kind === 'photo' ? 'ảnh' : 'video'}`}
                >
                  {s.kind === 'photo' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.url} alt="" />
                  ) : (
                    // Không dựng <video> cho thumbnail: mỗi thẻ video tốn 1 suất tải
                    // media, iOS giới hạn số video cùng lúc -> ô đen + ▶ là đủ nhận biết.
                    <span className="rv-thumb-vid" aria-hidden />
                  )}
                  {s.kind === 'video' && (
                    <span className="v" aria-hidden>
                      ▶
                    </span>
                  )}
                </button>
                <button
                  className="rv-thumb-x"
                  onClick={() => removeShot(s.id)}
                  aria-label="Xoá mục này"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="rv-foot">
          {error && (
            <div className="notice err" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          {shots.length > 0 && (
            <p className={`rv-size${overLimit ? ' over' : ''}`}>
              Tổng dung lượng: {formatSize(totalBytes)} / {formatSize(MAX_TOTAL_BYTES)}
              {overLimit && ' — vượt giới hạn, hãy xoá bớt ảnh/video'}
            </p>
          )}
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={createLink}
            disabled={shots.length === 0 || overLimit}
            title={overLimit ? 'Tổng dung lượng vượt 100MB — hãy xoá bớt mục' : undefined}
          >
            🔒 Tạo link ({shots.length})
          </button>
        </div>

        {/* Lightbox — chạm ảnh lớn để soi toàn màn hình. Chạm nền hoặc ✕ để đóng. */}
        {zoomed && current && (
          <div
            className="lightbox"
            onClick={() => setZoomed(false)}
            onTouchStart={(e) => (touchXRef.current = e.touches[0].clientX)}
            onTouchEnd={onTouchEnd}
          >
            <button className="lb-close" aria-label="Đóng">
              ✕
            </button>
            {current.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.id}
                src={current.url}
                alt="Xem toàn màn hình"
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <video
                key={current.id}
                src={current.url}
                controls
                playsInline
                autoPlay
                onLoadedMetadata={fixInfiniteDuration}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            {multi && (
              <>
                <button
                  className="rv-nav prev"
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(curIdx - 1);
                  }}
                  disabled={curIdx === 0}
                  aria-label="Mục trước"
                >
                  ‹
                </button>
                <button
                  className="rv-nav next"
                  onClick={(e) => {
                    e.stopPropagation();
                    goTo(curIdx + 1);
                  }}
                  disabled={curIdx === shots.length - 1}
                  aria-label="Mục sau"
                >
                  ›
                </button>
                <span className="rv-counter">
                  {curIdx + 1}/{shots.length}
                </span>
              </>
            )}
          </div>
        )}
      </main>
    );
  }

  // ---- Màn hình kết quả ----
  if (phase === 'done' && result) {
    // Link đã sẵn sàng khi có mã: lúc bấm "Tạo link" mà reserve chưa xong thì
    // result.code còn rỗng — hiện trạng thái chờ, tránh link/nút hỏng.
    const linkReady = !!result.code;
    const full = typeof window !== 'undefined' ? `${window.location.origin}${result.url}` : result.url;
    // Bỏ "https://" cho dễ đọc — người bán chỉ cần nhận ra link của mình.
    const shown = full.replace(/^https?:\/\//, '');
    return (
      <main className="done-screen">
        <div className="done-card">
          <div className="done-seal" aria-hidden>
            ✓
          </div>
          <h1 className="done-title">Đã xác minh thành công</h1>
          <p className="done-sub">
            Gửi link này cho khách để xem hình ảnh/video đã được xác minh thành công
          </p>

          {shots.length > 0 ? (
            <div className="done-preview">
              {shots.map((s) => (
                <div className="dp-item" key={s.id}>
                  {s.kind === 'photo' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.url} alt="" loading="lazy" decoding="async" />
                  ) : (
                    // Ô đen thay <video>: tránh dựng nhiều thẻ video (iOS giới hạn).
                    <span className="dp-vid-ph" aria-hidden />
                  )}
                  {s.kind === 'video' && (
                    <span className="dp-vid" aria-hidden>
                      ▶
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="done-preview empty">{result.count} media đã xác minh</div>
          )}
          <p className="done-count">{result.count} media đã xác minh</p>

          {uploadStatus === 'uploading' && (
            <p className="upload-note">Đang lưu ảnh lên máy chủ… đừng đóng trang nhé.</p>
          )}
          {uploadStatus === 'error' && (
            <div className="upload-note err">
              <span>Lưu ảnh chưa xong. {error}</span>
              <button className="btn-copy" onClick={() => uploadSealed(result.code)}>
                Thử lại
              </button>
            </div>
          )}

          {linkReady ? (
            <>
              <div className="link-box">
                <span className="link-text">{shown}</span>
                <button className="btn-copy" onClick={copyLink}>
                  {copied ? '✓ Đã sao chép' : 'Sao chép'}
                </button>
              </div>

              <div className="done-actions">
                {copied && <p className="done-copied">✓ Đã sao chép link</p>}
                <button className="btn-share" onClick={shareLink}>
                  Chia sẻ link cho khách
                </button>
                <Link className="link-quiet" href={result.url}>
                  Xem trước như khách hàng
                </Link>
                <button className="link-quiet" onClick={startNew}>
                  + Album mới
                </button>
              </div>
            </>
          ) : (
            uploadStatus !== 'error' && (
              <div className="link-box pending">
                <span className="spin" aria-hidden />
                <span className="link-text">Đang tạo link…</span>
              </div>
            )
          )}
        </div>
      </main>
    );
  }

  return (
    <div className="cam-shell">
      {flash && <div className="cam-flash" />}

      <video ref={liveRef} muted playsInline autoPlay className="viewfinder" />

      {/* Top bar */}
      <div className="cam-top">
        <div className="cam-brand"><img src="/logo-mark.png" alt="Ảnh Thật" className="brand-logo" /><span>Ảnh Thật</span></div>
        {quality && <div className="cam-quality">{quality}</div>}
        {recording ? (
          <div className="cam-rec"><span className="rec-dot" /> {mmss}</div>
        ) : (
          <button className="cam-flip" onClick={flip} aria-label="Đổi camera">⟲</button>
        )}
      </div>

      {error && !permBlocked && (
        <div className="cam-error">
          {error} <button onClick={() => startCamera(facing)}>Thử lại</button>
        </div>
      )}

      {/* Quyền camera đã bị CHẶN — nút "Thử lại" vô ích, phải mở lại trong cài đặt. */}
      {permBlocked && (
        <div className="cam-stall">
          <b>Camera đang bị chặn</b>
          <p>
            {inApp?.os === 'ios'
              ? 'Mở lại: bấm "aA" bên trái thanh địa chỉ → Cài đặt trang web → Camera → Cho phép. Rồi tải lại trang.'
              : 'Mở lại: bấm biểu tượng 🔒 (hoặc ⓘ) bên trái thanh địa chỉ → Quyền → Camera → Cho phép. Rồi tải lại trang.'}
          </p>
          <div className="cam-stall-acts">
            <button className="btn" onClick={() => window.location.reload()}>
              Tải lại trang
            </button>
          </div>
        </div>
      )}

      {phase === 'init' && !error && !permBlocked && (
        <div className="cam-hint">Đang mở camera…</div>
      )}

      {/* Camera mở được nhưng không ra hình — thường do webview app nhắn tin. */}
      {stalled && !error && (
        <div className="cam-stall">
          <b>Không nhận được hình từ camera</b>
          <p>
            {inApp?.isInApp
              ? `Trình duyệt của ${inApp.appName ?? 'ứng dụng này'} đang chặn camera. Hãy mở bằng trình duyệt để chụp được.`
              : 'Có thể một ứng dụng khác đang dùng camera. Hãy đóng ứng dụng đó rồi thử lại.'}
          </p>
          <div className="cam-stall-acts">
            {inApp?.isInApp && (
              <button className="btn" onClick={openInBrowser}>
                Mở bằng trình duyệt
              </button>
            )}
            <button className="btn ghost" onClick={() => startCamera(facing)}>
              Thử lại
            </button>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="cam-bottom">
        {!recording && (
          <div className="mode-toggle">
            <button className={mode === 'photo' ? 'on' : ''} onClick={() => setMode('photo')}>Ảnh</button>
            <button className={mode === 'video' ? 'on' : ''} onClick={() => setMode('video')}>Video</button>
          </div>
        )}

        <div className="cam-row">
          {/* Tray */}
          <button
            className="tray"
            onClick={() => {
              if (!shots.length) return;
              // Tray đang hiện mục mới nhất — bấm vào thì mở đúng mục đó.
              setPreviewId(shots[shots.length - 1].id);
              setPhase('review');
            }}
            aria-label="Xem các mục đã chụp"
            disabled={shots.length === 0}
          >
            {shots.length > 0 ? (
              <>
                {shots[shots.length - 1].kind === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shots[shots.length - 1].url} alt="" />
                ) : (
                  <video src={shots[shots.length - 1].url} muted />
                )}
                <span className="tray-count">{shots.length}</span>
              </>
            ) : null}
          </button>

          {/* Shutter */}
          <button
            className={`shutter ${mode === 'video' ? 'video' : ''} ${recording ? 'rec' : ''}`}
            onClick={onShutter}
            disabled={phase === 'init'}
            aria-label={mode === 'photo' ? 'Chụp' : recording ? 'Dừng quay' : 'Quay'}
          >
            <span />
          </button>

          {/* Send */}
          <button
            className={`send ${shots.length ? 'show' : ''}`}
            onClick={() => setPhase('review')}
            disabled={shots.length === 0}
          >
            Gửi{shots.length ? ` ${shots.length}` : ''}
          </button>
        </div>
      </div>

    </div>
  );
}
