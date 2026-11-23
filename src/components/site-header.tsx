"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// 公开页面共用心愿单、足迹与编辑室入口。
export function SiteHeader({ brandName = "下一站", brandSubtitle = "THE NEXT JOURNEY" }: { brandName?: string; brandSubtitle?: string }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    // 根据滚动位置将摄影封面上的透明导航切换为浅色导航。
    const update = () => setScrolled(window.scrollY > 72);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);
  return (
    <header className={`topbar editorial-topbar${scrolled ? " scrolled" : ""}`}>
      <Link className="brand" href="/" aria-label={`${brandName}，返回首页`}>
        <span className="brand-mark" aria-hidden="true">✳</span>
        <span className="brand-name"><span className="brand-title">{brandName}</span><small>{brandSubtitle}</small></span>
      </Link>
      <nav className="top-nav" aria-label="主要导航">
        <Link className={pathname.startsWith("/destinations/") ? "is-current" : ""} aria-current={pathname.startsWith("/destinations/") ? "page" : undefined} href="/#destinations">心愿单</Link>
        <Link className={pathname === "/visited" || pathname.startsWith("/visited/") ? "is-current" : ""} aria-current={pathname === "/visited" || pathname.startsWith("/visited/") ? "page" : undefined} href="/visited">足迹</Link>
        <Link className="topbar-admin-link" href="/admin">编辑室 <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  );
}
