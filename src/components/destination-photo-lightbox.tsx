"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { photoPreviewUrl } from "@/lib/media";

export type PhotoGallerySelection = {
  title: string;
  titles?: string[];
  images: string[];
  altTexts?: string[];
  captions?: string[];
};

// 为旅行地点与心愿目的地提供大图、左右翻页和键盘浏览。
export function DestinationPhotoLightbox({ selection, onClose, initialIndex = 0 }: { selection: PhotoGallerySelection; onClose: () => void; initialIndex?: number }) {
  const count = selection.images.length;
  const safeInitial = count > 0 ? Math.min(Math.max(0, initialIndex), count - 1) : 0;
  const [index, setIndex] = useState(safeInitial);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const stripStart = Math.max(0, Math.min(index - 2, count - 5));

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (count === 0) return;
    const oldOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    // 关闭键、方向键和 Tab 焦点循环均限定在当前照片灯箱里。
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      } else if (event.key === "ArrowRight" && count > 1) {
        event.preventDefault();
        setIndex(current => (current + 1) % count);
      } else if (event.key === "ArrowLeft" && count > 1) {
        event.preventDefault();
        setIndex(current => (current + count - 1) % count);
      } else if (event.key === "Tab") {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? [])];
        if (buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        const insideButtons = active instanceof HTMLButtonElement && buttons.includes(active);
        if (!insideButtons) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = oldOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [count]);

  if (count === 0) return null;

  // 手指水平滑动时切换相邻照片，忽略纵向滚动和双指缩放手势。
  function handleTouchEnd(clientX: number | undefined, clientY: number | undefined) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || clientX === undefined || clientY === undefined || count < 2) return;
    const deltaX = clientX - start.x;
    const deltaY = clientY - start.y;
    if (Math.abs(deltaX) > 55 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
      setIndex(current => (current + (deltaX < 0 ? 1 : count - 1)) % count);
    }
  }

  const activeTitle = selection.titles?.[index] || selection.title;

  return (
    <div className="cinematic-lightbox-overlay" role="presentation" onClick={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="cinematic-lightbox" role="dialog" aria-modal="true" aria-label={`${activeTitle}的旅行照片`} ref={dialogRef}>
        <div className="cinematic-lightbox-top">
          <h2>{activeTitle}</h2>
          <button type="button" ref={closeRef} className="cinematic-lightbox-close" aria-label="关闭照片查看器" onClick={onClose}>×</button>
        </div>
        <div
          className="cinematic-lightbox-stage"
          onTouchStart={event => {
            if (event.touches.length !== 1) { touchStart.current = null; return; }
            const touch = event.changedTouches[0];
            touchStart.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
          }}
          onTouchEnd={event => {
            const touch = event.changedTouches[0];
            handleTouchEnd(touch?.clientX, touch?.clientY);
          }}
          onTouchCancel={() => { touchStart.current = null; }}
        >
          <Image key={index} unoptimized src={selection.images[index]} alt={selection.altTexts?.[index] ?? `${selection.title}照片 ${index + 1}`} fill sizes="(max-width: 720px) 100vw, 85vw" />
          {count > 1 && (
            <>
              <button className="cinematic-lightbox-arrow is-prev" type="button" aria-label="上一张照片" onClick={() => setIndex(current => (current + count - 1) % count)}>‹</button>
              <button className="cinematic-lightbox-arrow is-next" type="button" aria-label="下一张照片" onClick={() => setIndex(current => (current + 1) % count)}>›</button>
            </>
          )}
        </div>
        {selection.captions?.[index] ? <p className="cinematic-lightbox-caption">{selection.captions[index]}</p> : null}
        <div className="cinematic-lightbox-bottom">
          {count > 1 && (
            <div className="cinematic-lightbox-filmstrip" role="group" aria-label="选择旅行照片">
              {selection.images.slice(stripStart, stripStart + 5).map((src, offset) => {
                const thumbnailIndex = stripStart + offset;
                return (
                <button
                  type="button"
                  key={thumbnailIndex}
                  className={thumbnailIndex === index ? "is-current" : ""}
                  onClick={() => setIndex(thumbnailIndex)}
                  aria-label={`查看第 ${thumbnailIndex + 1} 张照片`}
                  aria-pressed={thumbnailIndex === index}
                >
                  <Image src={photoPreviewUrl(src, 320)} unoptimized alt="" fill sizes="52px" />
                </button>
                );
              })}
            </div>
          )}
          <span aria-live="polite">{String(index + 1).padStart(2, "0")} / {String(count).padStart(2, "0")}</span>
        </div>
      </div>
    </div>
  );
}
