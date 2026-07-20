'use client';

import { useRef, useState } from 'react';

export type Slide = { id: string; kind: 'photo' | 'video'; src: string };

/**
 * Album lướt được như xem ảnh trong điện thoại: cuộn ngang + snap từng khung,
 * có bộ đếm "1/N" và chấm chỉ vị trí. Một ảnh/video mỗi khung.
 */
export default function Gallery({ slides }: { slides: Slide[] }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);

  function onScroll() {
    const el = trackRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) setIdx(i);
  }

  function goTo(i: number) {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  }

  const single = slides.length <= 1;

  return (
    <div className="gallery">
      <div className="gallery-track" ref={trackRef} onScroll={onScroll}>
        {slides.map((s) => (
          <div className="slide" key={s.id}>
            {s.kind === 'video' ? (
              <video src={s.src} controls playsInline preload="metadata" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.src} alt="Ảnh sản phẩm đã niêm phong" />
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
    </div>
  );
}
