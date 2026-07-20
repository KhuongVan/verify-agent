'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * M2 (bản gọn) — Chụp ảnh HOẶC quay video trực tiếp bằng camera trình duyệt.
 * KHÔNG có input file: media chỉ được tạo từ camera trong app, đúng lời hứa
 * "chụp/quay trong app, không nhận file từ thư viện". Liveness/OCR để bước sau.
 */

type Mode = 'photo' | 'video';
type Phase = 'idle' | 'ready' | 'recording' | 'preview' | 'sealing' | 'done';
type Captured = { blob: Blob; url: string; kind: Mode };

function pickMime(): string {
  const cands = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  for (const c of cands) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c)) return c;
  }
  return '';
}

export default function CapturePage() {
  const liveRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef<Captured | null>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [captured, setCaptured] = useState<Captured | null>(null);
  const [shopName, setShopName] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ code: string; url: string } | null>(null);

  capturedRef.current = captured;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startCamera = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Trình duyệt không hỗ trợ camera, hoặc trang không chạy trên HTTPS/localhost.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: true,
      });
      streamRef.current = stream;
      if (liveRef.current) {
        liveRef.current.srcObject = stream;
        await liveRef.current.play().catch(() => {});
      }
      setPhase('ready');
    } catch (e) {
      const name = (e as DOMException)?.name;
      if (name === 'NotAllowedError') setError('Bạn đã từ chối quyền camera. Hãy cho phép rồi thử lại.');
      else if (name === 'NotFoundError') setError('Không tìm thấy camera trên thiết bị.');
      else setError('Không mở được camera. Kiểm tra quyền truy cập và thử lại.');
    }
  }, []);

  useEffect(() => {
    return () => {
      stopStream();
      if (timerRef.current) clearInterval(timerRef.current);
      if (capturedRef.current) URL.revokeObjectURL(capturedRef.current.url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Ảnh: chụp 1 khung hình từ luồng camera ----
  function takePhoto() {
    const video = liveRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        setCaptured({ blob, url, kind: 'photo' });
        setPhase('preview');
      },
      'image/jpeg',
      0.92,
    );
  }

  // ---- Video ----
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
      const type = rec.mimeType || 'video/webm';
      const blob = new Blob(chunksRef.current, { type });
      const url = URL.createObjectURL(blob);
      setCaptured({ blob, url, kind: 'video' });
      setPhase('preview');
    };
    recorderRef.current = rec;
    rec.start();
    setSeconds(0);
    setPhase('recording');
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
  }

  function reset() {
    if (captured) URL.revokeObjectURL(captured.url);
    setCaptured(null);
    setResult(null);
    setPhase('ready');
  }

  async function seal() {
    if (!captured) return;
    setPhase('sealing');
    setError(null);

    let file: File;
    if (captured.kind === 'photo') {
      file = new File([captured.blob], 'capture.jpg', { type: 'image/jpeg' });
    } else {
      const baseMime = captured.blob.type.split(';')[0] || 'video/webm';
      const ext = baseMime === 'video/mp4' ? 'mp4' : 'webm';
      file = new File([captured.blob], `capture.${ext}`, { type: baseMime });
    }

    const data = new FormData();
    data.set('media', file);
    data.set('capturedAt', new Date().toISOString());
    if (shopName.trim()) data.set('shopName', shopName.trim());
    if (note.trim()) data.set('note', note.trim());

    try {
      const res = await fetch('/api/seal', { method: 'POST', body: data });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Niêm phong thất bại.');
        setPhase('preview');
      } else {
        setResult(json);
        setPhase('done');
        stopStream();
      }
    } catch {
      setError('Không kết nối được máy chủ.');
      setPhase('preview');
    }
  }

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const canSwitchMode = phase === 'idle' || phase === 'ready';

  return (
    <main className="page">
      <div className="brandline">
        <div className="mark">🔒</div>
        <div className="brandname">
          Nguyên<b>Bản</b>
        </div>
      </div>

      <h1 className="title">Chụp / Quay sản phẩm</h1>
      <p className="muted">
        Chụp ảnh hoặc quay video trực tiếp bằng camera — không nhận file từ thư viện. Nên xoay sản phẩm
        để thấy rõ.
      </p>

      {/* Chuyển chế độ Ảnh / Video */}
      <div className="seg" role="tablist" aria-label="Chế độ chụp">
        <button
          role="tab"
          aria-selected={mode === 'photo'}
          className={mode === 'photo' ? 'on' : ''}
          onClick={() => canSwitchMode && setMode('photo')}
          disabled={!canSwitchMode}
        >
          📷 Ảnh
        </button>
        <button
          role="tab"
          aria-selected={mode === 'video'}
          className={mode === 'video' ? 'on' : ''}
          onClick={() => canSwitchMode && setMode('video')}
          disabled={!canSwitchMode}
        >
          🎬 Video
        </button>
      </div>

      {/* Khung camera / xem lại */}
      <div className="cam" style={{ marginTop: 14 }}>
        {captured ? (
          captured.kind === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={captured.url} alt="Ảnh đã chụp" className="cam-video" />
          ) : (
            <video src={captured.url} controls playsInline className="cam-video" />
          )
        ) : (
          <video ref={liveRef} muted playsInline autoPlay className="cam-video" />
        )}

        {phase === 'idle' && (
          <div className="cam-overlay">
            <button className="btn" onClick={startCamera}>
              📷 Bật camera
            </button>
          </div>
        )}
        {phase === 'recording' && (
          <div className="cam-badge">
            <span className="rec-dot" /> ĐANG QUAY · {mmss}
          </div>
        )}
      </div>

      {/* Nút điều khiển */}
      <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
        {phase === 'ready' && mode === 'photo' && (
          <button className="btn" onClick={takePhoto}>
            📷 Chụp
          </button>
        )}
        {phase === 'ready' && mode === 'video' && (
          <button className="btn" onClick={startRecording}>
            ⏺ Bắt đầu quay
          </button>
        )}
        {phase === 'recording' && (
          <button className="btn" onClick={stopRecording}>
            ⏹ Dừng quay
          </button>
        )}
        {phase === 'preview' && (
          <>
            <button className="btn" onClick={seal}>
              🔒 Niêm phong & tạo link
            </button>
            <button className="btn ghost" onClick={reset}>
              ↺ {captured?.kind === 'photo' ? 'Chụp lại' : 'Quay lại'}
            </button>
          </>
        )}
        {phase === 'sealing' && (
          <button className="btn" disabled>
            Đang niêm phong…
          </button>
        )}
      </div>

      {/* Thông tin kèm theo */}
      {(phase === 'ready' || phase === 'preview') && (
        <div style={{ marginTop: 18 }}>
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
            <label htmlFor="note">Mô tả (tuỳ chọn — hiển thị tách bạch, không được ký)</label>
            <textarea
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Chanel Classic Flap Medium, fullset box & card..."
            />
          </div>
        </div>
      )}

      {error && (
        <div className="notice err" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div className="notice" style={{ marginTop: 16 }}>
          <b>Đã niêm phong.</b> Mã: <code>{result.code}</code>
          <Link className="result-link" href={result.url}>
            Mở trang xác thực: {result.url} →
          </Link>
        </div>
      )}

      <p className="muted" style={{ marginTop: 26, fontSize: 13 }}>
        <Link href="/">‹ Về trang chủ</Link>
      </p>
    </main>
  );
}
