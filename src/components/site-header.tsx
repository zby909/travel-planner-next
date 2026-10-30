"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 统一杂志封面的期刊标识、公开目录和管理入口。
export function SiteHeader({ brandName = "下一站", brandSubtitle = "THE NEXT JOURNEY" }: { brandName?: string; brandSubtitle?: string }) {
  const pathname = usePathname();
  return (
    <header className="topbar editorial-topbar">
      <Link className="brand" href="/" aria-label={`${brandName}，返回首页`}>
        <span className="brand-mark">✳</span>
        <span className="brand-name">{brandName}<small>{brandSubtitle}</small></span>
      </Link>
      <span className="editorial-topbar-issue">AN ONGOING JOURNAL · EST. NOW</span>
      <nav className="top-nav" aria-label="主要导航">
        <Link className={pathname === "/" ? "is-current" : ""} href="/#destinations">未来的旅程</Link>
        <Link className={pathname === "/visited" ? "is-current" : ""} href="/visited">去过的地方</Link>
        <Link className="topbar-admin-link" href="/admin">编辑室 <span aria-hidden="true">↗</span></Link>
      </nav>
    </header>
  );
}