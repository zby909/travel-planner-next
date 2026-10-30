"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// 根据页面滚动位置切换透明导航与浅色导航。
// 展示当前站点品牌，并根据页面滚动状态切换导航样式。
export function SiteHeader({ brandName = "下一站", brandSubtitle = "THE NEXT JOURNEY" }: { brandName?: string; brandSubtitle?: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 24);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header className={`topbar${scrolled ? " scrolled" : ""}`}>
      <Link className="brand" href="/" aria-label={`${brandName}，返回首页`}>
        <span className="brand-mark">✳</span>
        <span className="brand-name">
          {brandName}
          <small>{brandSubtitle}</small>
        </span>
      </Link>
      <nav className="top-nav" aria-label="主要导航">
        <Link href="/#destinations">未来想去</Link>
        <Link href="/visited">已经走过</Link>
        <Link href="/admin">管理后台</Link>
      </nav>
      <span className="topbar-note">记录旅途 · 规划下一站</span>
    </header>
  );
}
