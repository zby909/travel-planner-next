"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

export type PhotoGallerySelection = {
  title: string;
  images: string[];
};

// 为旅行目的地提供原静态版的照片放大、左右翻页与键盘浏览功能。
export function DestinationPhotoLightbox({ selection, onClose }: { selection: PhotoGallerySelection; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchStart = useRef<number | null>(null);
  const count = selection.images.length;

  useEffect(() => {
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    // 关闭键、方向键和 Tab 焦点循环均限定在当前照片灯箱里。
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        setIndex(current => (current + 1) % count);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex(current => (current + count - 1) % count);
      } else if (event.key === "Tab") {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [count, onClose]);

  // 手指水平滑动时切换相邻照片，不阻止正常的缩放与触摸行为。
  function handleTouchEnd(clientX: number) {
    if (touchStart.current === null || count < 2) return;
    const delta = clientX - touchStart.current;
    if (Math.abs(delta) > 55) setIndex(current => (current + (delta < 0 ? 1 : count - 1)) % count);
    touchStart.current = null;
  }

  return (
    <div className="cinematic-lightbox-overlay" role="presentation" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="cinematic-lightbox" role="dialog" aria-modal="true" aria-label={`${selection.title}的旅行照片`} ref={dialogRef}>
        <div className="cinematic-lightbox-top">
          <div><span>TRAVEL POSTCARDS / PHOTO GALLERY</span><h2>{selection.title}</h2></div>
          <button type="button" ref={closeRef} className="cinematic-lightbox-close" aria-label="关闭照片查看器" onClick={onClose}>×</button>
        </div>
        <div className="cinematic-lightbox-stage" onTouchStart={event => { touchStart.current = event.changedTouches[0]?.clientX ?? null; }} onTouchEnd={event => handleTouchEnd(event.changedTouches[0]?.clientX ?? 0)}>
          <Image key={selection.images[index]} unoptimized src={selection.images[index]} alt={`${selection.title}景点照片 ${index + 1}`} fill sizes="(max-width: 720px) 100vw, 85vw" />
          {count > 1 && (
            <>
              <button className="cinematic-lightbox-arrow is-prev" type="button" aria-label="上一张照片" onClick={() => setIndex(current => (current + count - 1) % count)}>‹</button>
              <button className="cinematic-lightbox-arrow is-next" type="button" aria-label="下一张照片" onClick={() => setIndex(current => (current + 1) % count)}>›</button>
            </>
          )}
        </div>
        <div className="cinematic-lightbox-bottom">
          <span>{selection.title} · FRAME {String(index + 1).padStart(2, "0")}</span>
          {count > 1 && (
            <div className="cinematic-lightbox-filmstrip" role="group" aria-label="选择旅行照片">
              {selection.images.map((src, thumbnailIndex) => (
                <button
                  type="button"
                  key={src}
                  className={thumbnailIndex === index ? "is-current" : ""}
                  onClick={() => setIndex(thumbnailIndex)}
                  aria-label={`查看第 ${thumbnailIndex + 1} 张照片`}
                  aria-pressed={thumbnailIndex === index}
                >
                  <Image src={src} unoptimized alt="" fill sizes="52px" />
                </button>
              ))}
            </div>
          )}
          <span aria-live="polite">{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}
