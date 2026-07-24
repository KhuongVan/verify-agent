'use client';

import { useRef, useState } from 'react';

import { fixInfiniteDuration } from '@/lib/videoDuration';

export type Slide = { id: string; kind: 'photo' | 'video'; src: string };

/**
 * Album lướt được như xem ảnh trong điện thoại: cuộn ngang + snap từng khung,
 * có bộ đếm "1/N" và chấm chỉ vị trí. Một ảnh/video mỗi khung.
 * Chạm ảnh -> xem toàn màn hình (lightbox).
 */
export default function Gallery({ slides }: { slides: Slide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const touchXRef = useRef<number | null>(null);
  const [idx, setIdx] = useState(0);
  const [zoomed, setZoomed] = useState(false);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el || i < 0 || i >= slides.length) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  function onLbTouchEnd(e: React.TouchEvent) {
    const start = touchXRef.current;
    touchXRef.current = null;
    if (start === null) return;
    const dx = e.changedTouches[0].clientX - start;
    if (Math.abs(dx) > 40) goTo(idx + (dx < 0 ? 1 : -1)); // vuốt trái -> ảnh sau
  }

  const single = slides.length <= 1;
  const current = slides[idx];

  return (
    <div className="gallery">
      <div className="gallery-track" ref={trackRef} onScroll={onScroll}>
        {slides.map((s) => (
          <div className="slide" key={s.id}>
            {s.kind === 'video' ? (
              <video
                src={s.src}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={fixInfiniteDuration}
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={s.src}
                alt="Ảnh sản phẩm đã xác minh"
                onClick={() => setZoomed(true)}
                style={{ cursor: 'zoom-in' }}
              />
            )}
          </div>
        ))}
      </div>

      {!single && (
        <>
          <div className="gallery-count">
            {idx + 1}/{slides.length}
          </div>
          <div className="gallery-dots">
            {slides.map((s, i) => (
              <button
                key={s.id}
                className={i === idx ? 'on' : ''}
                aria-label={`Xem mục ${i + 1}`}
                onClick={() => goTo(i)}
              />
            ))}
          </div>
        </>
      )}

      {/* Lightbox — chạm ảnh để xem toàn màn hình. Chạm nền hoặc ✕ để đóng. */}
      {zoomed && current && (
        <div
          className="lightbox"
          onClick={() => setZoomed(false)}
          onTouchStart={(e) => (touchXRef.current = e.touches[0].clientX)}
          onTouchEnd={onLbTouchEnd}
        >
          <button className="lb-close" aria-label="Đóng">
            ✕
          </button>
          {current.kind === 'photo' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={current.src} alt="Xem toàn màn hình" onClick={(e) => e.stopPropagation()} />
          ) : (
            <video
              src={current.src}
              controls
              playsInline
              autoPlay
              onLoadedMetadata={fixInfiniteDuration}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          {!single && (
            <>
              <button
                className="rv-nav prev"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(idx - 1);
                }}
                disabled={idx === 0}
                aria-label="Ảnh trước"
              >
                ‹
              </button>
              <button
                className="rv-nav next"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(idx + 1);
                }}
                disabled={idx === slides.length - 1}
                aria-label="Ảnh sau"
              >
                ›
              </button>
              <span className="rv-counter">
                {idx + 1}/{slides.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
