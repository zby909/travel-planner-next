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
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const hero = main.querySelector<HTMLElement>(".cinematic-hero");
    const animatedCover = main.querySelector<HTMLElement>(".cinematic-hero, .cinematic-archive, .cinematic-story");
    const stack = main.querySelector<HTMLElement>(".cinematic-stack");
    const tiltCards = [...main.querySelectorAll<HTMLElement>(".cinematic-season")];
    const cleanups: Array<() => void> = [];
    let frame = 0;

    // 将滚动位置转换为顶部进度及小幅摄影景深，避免滚动监听内频繁布局。
    function updateScroll() {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const ratio = maxScroll ? Math.min(1, window.scrollY / maxScroll) : 0;
      progress?.style.setProperty("--travel-progress", String(ratio));
      if (!reducedMotion && main) {
        const offset = Math.min(72, window.scrollY * 0.065);
        main.style.setProperty("--cinema-scroll", `${offset}px`);
        stack?.style.setProperty("--stack-scroll", window.innerWidth > 800 ? `${Math.min(52, window.scrollY * 0.045)}px` : "0px");
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
        animatedCover.classList.toggle("cinema-in-view", entries[0]?.isIntersecting ?? false);
      }, { rootMargin: "120px 0px" });
      coverObserver.observe(animatedCover);
      cleanups.push(() => {
        coverObserver.disconnect();
        animatedCover.classList.remove("cinema-in-view");
      });
    }

    if (!reducedMotion && "IntersectionObserver" in window) {
      const observer = new IntersectionObserver((entries, activeObserver) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-visible");
          activeObserver.unobserve(entry.target);
        }
      }, { threshold: 0.06, rootMargin: "0px 0px -26px 0px" });

      // 先显示首屏内容，再开启隐藏样式；无 JavaScript 时内容始终可见。
      function observe(element: HTMLElement) {
        if (element.classList.contains("is-visible")) return;
        if (element.getBoundingClientRect().top < window.innerHeight * 0.87) {
          element.classList.add("is-visible");
        } else {
          observer.observe(element);
        }
      }

      main.querySelectorAll<HTMLElement>("[data-motion]").forEach(observe);
      main.classList.add("travel-motion-ready");

      const grid = main.querySelector(".editorial-destination-grid");
      const mutations = grid ? new MutationObserver((entries) => {
        for (const entry of entries) {
          for (const node of entry.addedNodes) {
            if (!(node instanceof HTMLElement)) continue;
            if (node.matches("[data-motion]")) observe(node);
            node.querySelectorAll<HTMLElement>("[data-motion]").forEach(observe);
          }
        }
      }) : null;
      if (grid) mutations?.observe(grid, { childList: true, subtree: true });

      cleanups.push(() => {
        observer.disconnect();
        mutations?.disconnect();
        main.classList.remove("travel-motion-ready");
      });
    }

    if (!reducedMotion && finePointer) {
      // 用极小的鼠标位移制造明信片和四季摄影的景深，离开时自然归位。
      if (hero && stack) {
        const moveStack = (event: PointerEvent) => {
          const rect = hero.getBoundingClientRect();
          const x = (event.clientX - rect.left) / rect.width - 0.5;
          const y = (event.clientY - rect.top) / rect.height - 0.5;
          stack.style.setProperty("--stack-x", `${(x * 16).toFixed(1)}px`);
          stack.style.setProperty("--stack-y", `${(y * 12).toFixed(1)}px`);
        };
        const resetStack = () => {
          stack.style.removeProperty("--stack-x");
          stack.style.removeProperty("--stack-y");
        };
        hero.addEventListener("pointermove", moveStack);
        hero.addEventListener("pointerleave", resetStack);
        cleanups.push(() => {
          hero.removeEventListener("pointermove", moveStack);
          hero.removeEventListener("pointerleave", resetStack);
        });
      }

      for (const card of tiltCards) {
        const moveCard = (event: PointerEvent) => {
          const rect = card.getBoundingClientRect();
          card.style.setProperty("--photo-x", `${((event.clientX - rect.left) / rect.width - 0.5) * -10}px`);
          card.style.setProperty("--photo-y", `${((event.clientY - rect.top) / rect.height - 0.5) * -10}px`);
        };
        const resetCard = () => {
          card.style.removeProperty("--photo-x");
          card.style.removeProperty("--photo-y");
        };
        card.addEventListener("pointermove", moveCard);
        card.addEventListener("pointerleave", resetCard);
        cleanups.push(() => {
          card.removeEventListener("pointermove", moveCard);
          card.removeEventListener("pointerleave", resetCard);
        });
      }
    }

    return () => {
      cleanups.forEach(cleanup => cleanup());
      main.style.removeProperty("--cinema-scroll");
    };
  }, []);

  return <div className="travel-progress" ref={progressRef} aria-hidden="true" />;
}
