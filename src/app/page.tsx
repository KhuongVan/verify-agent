'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import Link from 'next/link';

import { CATEGORIES } from '@/lib/categories';
import { androidBrowserIntent, detectInApp, iosSafariUrl, type InAppInfo } from '@/lib/inapp';

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

function pickMime(): string {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
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

  const [facing, setFacing] = useState<Facing>('environment');
  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('init');
  // Chờ đọc localStorage xong mới quyết định hiện màn chào hay camera — tránh
  // nháy một khung hình "Đang mở camera…" rồi mới nhảy sang màn chào.
  const [booting, setBooting] = useState(true);
  const [inApp, setInApp] = useState<InAppInfo | null>(null);
  /** Camera "mở được" nhưng không ra hình — màn đen trong webview. */
  const [stalled, setStalled] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  /** Mục đang xem lớn ở trang "Xem lại". */
  const [previewId, setPreviewId] = useState<string | null>(null);
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
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt không hỗ trợ camera, hoặc trang không chạy trên HTTPS/localhost.');
      return;
    }
    stopStream();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: want },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setPhase('live');
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') setError('Bạn đã từ chối quyền camera. Hãy cho phép rồi thử lại.');
      else if (name === 'NotFoundError') setError('Không tìm thấy camera trên thiết bị.');
      else setError('Không mở được camera. Kiểm tra quyền truy cập và thử lại.');
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
    if (shots.length === 0 || !categoryId) return;
    const code = reservedCode; // có thể null nếu reserve chưa xong / lỗi
    const url = code ? `/v/${code}` : '';

    // (1) Mở bảng chia sẻ ngay trong cú chạm. Không có mã hoặc máy không hỗ trợ
    // thì bỏ qua — người bán vẫn bấm nút "Chia sẻ" ở màn kết quả được.
    if (code && navigator.share) {
      navigator
        .share({ title: 'Ảnh Thật — Thấy thật trước khi mua', url: `${window.location.origin}${url}` })
        .catch(() => {});
    }

    // (2) Sang màn kết quả ngay. count/url tạm theo mã đã đặt; nếu chưa có mã,
    // uploadSealed sẽ điền lại từ phản hồi server.
    stopStream();
    setError(null);
    if (code) setResult({ code, url, count: shots.length });
    setPhase('done');

    // (3) Upload nền.
    void uploadSealed(code);
  }

  /** Upload ảnh + niêm phong. Gắn vào mã đã đặt (nếu có). Cập nhật uploadStatus. */
  async function uploadSealed(code: string | null) {
    setUploadStatus('uploading');
    const data = new FormData();
    for (const s of shotsRef.current) {
      const ext = s.kind === 'photo' ? 'jpg' : s.blob.type.split(';')[0] === 'video/mp4' ? 'mp4' : 'webm';
      const type = s.kind === 'photo' ? 'image/jpeg' : s.blob.type.split(';')[0] || 'video/webm';
      data.append('media', new File([s.blob], `${s.id}.${ext}`, { type }));
    }
    data.set('capturedAt', new Date().toISOString());
    if (code) data.set('code', code);
    if (shopName.trim()) data.set('shopName', shopName.trim());
    if (categoryId) data.set('categoryId', categoryId);
    if (note.trim()) data.set('note', note.trim());

    try {
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

          {inApp.os === 'ios' ? (
            <ol className="intro-steps" style={{ marginTop: 26 }}>
              <li>
                <span className="n">1</span>
                <div>
                  <b>Bấm nút ⋯ hoặc ⇱ ở góc màn hình</b>
                  <span>Thường nằm ở góc trên bên phải, hoặc thanh dưới cùng.</span>
                </div>
              </li>
              <li>
                <span className="n">2</span>
                <div>
                  <b>Chọn “Mở trong Safari” hoặc “Mở bằng trình duyệt”</b>
                  <span>Sau đó chụp/quay như bình thường.</span>
                </div>
              </li>
            </ol>
          ) : (
            <ol className="intro-steps" style={{ marginTop: 26 }}>
              <li>
                <span className="n">1</span>
                <div>
                  <b>Bấm nút bên dưới để mở trình duyệt</b>
                  <span>Nếu không mở được thì bấm ⋮ ở góc rồi chọn “Mở bằng trình duyệt”.</span>
                </div>
              </li>
            </ol>
          )}

          <div className="intro-foot">
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
                      /* clipboard bị chặn — vẫn còn 2 bước hướng dẫn ở trên */
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

        {/* Khung xem lớn — bấm thumbnail bên dưới để đổi mục. */}
        <div className="rv-stage">
          {current &&
            (current.kind === 'photo' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url} alt="Mục vừa chụp" />
            ) : (
              <video src={current.url} controls playsInline preload="metadata" />
            ))}
          {current && (
            <button className="rv-del" onClick={() => removeShot(current.id)}>
              Xoá mục này
            </button>
          )}
        </div>

        {shots.length > 1 && (
          <div className="rv-strip">
            {shots.map((s) => (
              <button
                key={s.id}
                className={`rv-thumb${s.id === current?.id ? ' on' : ''}`}
                onClick={() => setPreviewId(s.id)}
                aria-label={`Xem mục ${s.kind === 'photo' ? 'ảnh' : 'video'}`}
              >
                {s.kind === 'photo' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={s.url} alt="" />
                ) : (
                  <video src={s.url} muted playsInline />
                )}
                {s.kind === 'video' && (
                  <span className="v" aria-hidden>
                    ▶
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="rv-form">
          <div className="field">
            <label htmlFor="categoryId">Ngành hàng</label>
            <select
              id="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— Chọn ngành hàng —</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="shopName">Tên shop (tuỳ chọn)</label>
            <input
              id="shopName"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              placeholder="Lux House · Sài Gòn"
            />
          </div>
          <div className="field">
            <label htmlFor="note">Mô tả (tuỳ chọn — hiển thị tách bạch)</label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Chanel Classic Flap Medium, fullset box & card..."
            />
          </div>
        </div>

        <div className="rv-foot">
          {error && (
            <div className="notice err" style={{ marginBottom: 12 }}>
              {error}
            </div>
          )}
          <button
            className="btn"
            style={{ width: '100%' }}
            onClick={createLink}
            disabled={shots.length === 0 || !categoryId}
            title={!categoryId ? 'Hãy chọn ngành hàng trước' : undefined}
          >
            🔒 Tạo link ({shots.length})
          </button>
        </div>
      </main>
    );
  }

  // ---- Màn hình kết quả ----
  if (phase === 'done' && result) {
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
                    <video src={s.url} muted playsInline preload="metadata" />
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
        {recording ? (
          <div className="cam-rec"><span className="rec-dot" /> {mmss}</div>
        ) : (
          <button className="cam-flip" onClick={flip} aria-label="Đổi camera">⟲</button>
        )}
      </div>

      {error && <div className="cam-error">{error} <button onClick={() => startCamera(facing)}>Thử lại</button></div>}

      {phase === 'init' && !error && <div className="cam-hint">Đang mở camera…</div>}

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
