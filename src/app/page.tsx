'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CATEGORIES } from '@/lib/categories';

/**
 * Trang chủ = màn hình chụp kiểu camera điện thoại.
 * Chụp ảnh / quay video trực tiếp (không nhận file thư viện), gom nhiều mục,
 * bấm "Gửi" -> xác minh cả loạt -> trả về một link để gửi khách.
 */

type Facing = 'environment' | 'user';
type Mode = 'photo' | 'video';
type Phase = 'welcome' | 'init' | 'live' | 'review' | 'sealing' | 'done';
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

  const [facing, setFacing] = useState<Facing>('environment');
  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('init');
  // Chờ đọc localStorage xong mới quyết định hiện màn chào hay camera — tránh
  // nháy một khung hình "Đang mở camera…" rồi mới nhảy sang màn chào.
  const [booting, setBooting] = useState(true);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [shots, setShots] = useState<Shot[]>([]);
  const [flash, setFlash] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shopName, setShopName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ code: string; url: string; count: number } | null>(null);
  const [copied, setCopied] = useState(false);

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

    if (seen) startCamera('environment');
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
    v.play().catch(() => {});
  }, [phase]);

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
    setShots((prev) => {
      const s = prev.find((x) => x.id === id);
      if (s) URL.revokeObjectURL(s.url);
      return prev.filter((x) => x.id !== id);
    });
  }

  async function send() {
    if (shots.length === 0) return;
    setPhase('sealing');
    setError(null);
    const data = new FormData();
    for (const s of shots) {
      const ext = s.kind === 'photo' ? 'jpg' : s.blob.type.split(';')[0] === 'video/mp4' ? 'mp4' : 'webm';
      const type = s.kind === 'photo' ? 'image/jpeg' : s.blob.type.split(';')[0] || 'video/webm';
      data.append('media', new File([s.blob], `${s.id}.${ext}`, { type }));
    }
    data.set('capturedAt', new Date().toISOString());
    if (shopName.trim()) data.set('shopName', shopName.trim());
    if (categoryId) data.set('categoryId', categoryId);
    if (note.trim()) data.set('note', note.trim());

    try {
      const res = await fetch('/api/seal', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gửi thất bại.');
        setPhase('review');
      } else {
        setResult(json);
        setPhase('done');
        stopStream();
        // Giữ blob URL để màn kết quả xem lại được ảnh vừa gửi — không tải lại
        // từ server, không tốn thêm băng thông. Dọn ở startNew() và lúc unmount.
      }
    } catch {
      setError('Không kết nối được máy chủ.');
      setPhase('review');
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
                <span>Khách mở ra tự kiểm được, không cần tin lời bạn.</span>
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

          <div className="link-box">
            <span className="link-text">{shown}</span>
            <button className="btn-copy" onClick={copyLink}>
              {copied ? '✓ Đã chép' : 'Sao chép'}
            </button>
          </div>

          <div className="done-actions">
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
            onClick={() => shots.length && setPhase('review')}
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

      {/* Review sheet */}
      {(phase === 'review' || phase === 'sealing') && (
        <div className="sheet-backdrop" onClick={() => phase === 'review' && setPhase('live')}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" />
            <h2 className="sheet-title">Xem lại {shots.length} mục</h2>
            <div className="thumb-grid">
              {shots.map((s) => (
                <div className="thumb" key={s.id}>
                  {s.kind === 'photo' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.url} alt="" />
                  ) : (
                    <video src={s.url} muted playsInline />
                  )}
                  <button className="thumb-x" onClick={() => removeShot(s.id)} aria-label="Xoá">×</button>
                  {s.kind === 'video' && <span className="thumb-vid">▶</span>}
                </div>
              ))}
            </div>

            <div className="field">
              <label htmlFor="shopName">Tên shop (tuỳ chọn)</label>
              <input id="shopName" type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="Lux House · Sài Gòn" />
            </div>
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
              <label htmlFor="note">Mô tả (tuỳ chọn — hiển thị tách bạch)</label>
              <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Chanel Classic Flap Medium, fullset box & card..." />
            </div>

            {error && <div className="notice err" style={{ marginBottom: 12 }}>{error}</div>}

            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn ghost" onClick={() => setPhase('live')}>Chụp thêm</button>
              <button
                className="btn"
                style={{ flex: 1 }}
                onClick={send}
                disabled={phase === 'sealing' || shots.length === 0 || !categoryId}
                title={!categoryId ? 'Hãy chọn ngành hàng trước' : undefined}
              >
                {phase === 'sealing' ? 'Đang xác minh…' : `🔒 Tạo link (${shots.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
