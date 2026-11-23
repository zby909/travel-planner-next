"use client";

import { useEffect, useRef } from "react";

// 为公开旅行页面添加轻量滚动进度、景深和章节入场，不依赖额外动画库。
export function TravelMotion() {
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const progress = progressRef.current;
    const main = progress?.closest<HTMLElement>("main");
    if (!progress || !main) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const animatedCover = main.querySelector<HTMLElement>(".cinematic-archive, .cinematic-story");
    const cleanups: Array<() => void> = [];
    let frame = 0;

    // 将滚动位置转换为顶部进度及小幅摄影景深，避免滚动监听内频繁布局。
    function updateScroll() {
      const scrollY = Math.max(0, window.scrollY);
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = maxScroll ? Math.min(1, scrollY / maxScroll) : 0;
      progress?.style.setProperty("--travel-progress", String(ratio));
      if (!reducedMotion && animatedCover) {
        const offset = Math.min(72, scrollY * 0.065);
        animatedCover.style.setProperty("--cinema-scroll", `${offset}px`);
      }
      frame = 0;
    }

    // 同一帧内只安排一次视差和进度条更新。
    function onScroll() {
      if (frame) return;
      frame = window.requestAnimationFrame(updateScroll);
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    cleanups.push(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.cancelAnimationFrame(frame);
    });
    updateScroll();

    if (!reducedMotion && animatedCover && "IntersectionObserver" in window) {
      // 摄影封面离开视口后暂停持续推镜，返回时沿原有动画继续。
      animatedCover.classList.add("cinema-in-view");
      const coverObserver = new IntersectionObserver(entries => {
        animatedCover.classList.toggle("cinema-in-view", entries.at(-1)?.isIntersecting ?? false);
      }, { rootMargin: "120px 0px" });
      coverObserver.observe(animatedCover);
      cleanups.push(() => {
        coverObserver.disconnect();
        animatedCover.classList.remove("cinema-in-view");
      });
    }

    const motionTargets = main.querySelectorAll<HTMLElement>("[data-motion]");
    if (!reducedMotion && motionTargets.length > 0 && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries, activeObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          activeObserver.unobserve(entry.target);
        }
      }, { threshold: 0, rootMargin: "0px 0px -26px 0px" });

      // 先显示首屏内容，再开启隐藏样式；无 JavaScript 时内容始终可见。
      function observe(element: HTMLElement) {
        if (element.classList.contains("is-visible")) return;
        if (element.getBoundingClientRect().top < window.innerHeight * 0.87) {
          element.classList.add("is-visible");
        } else {
          observer.observe(element);
        }
      }

      motionTargets.forEach(observe);
      main.classList.add("travel-motion-ready");

      cleanups.push(() => {
        observer.disconnect();
        main.classList.remove("travel-motion-ready");
      });
    }

    return () => {
      cleanups.forEach(cleanup => cleanup());
      animatedCover?.style.removeProperty("--cinema-scroll");
    };
  }, []);

  return <div className="travel-progress" ref={progressRef} aria-hidden="true" />;
}
