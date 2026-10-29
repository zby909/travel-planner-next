import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="topbar">
      <Link className="brand" href="/" aria-label="下一站，返回首页">
        <span className="brand-mark">✳</span>
        <span className="brand-name">
          下一站
          <small>THE NEXT JOURNEY</small>
        </span>
      </Link>
      <nav className="top-nav" aria-label="主要导航">
        <Link href="/#destinations">未来想去</Link>
        <Link href="/visited">已经走过</Link>
        <Link href="/#flight-sample">机票样本</Link>
        <Link href="/admin">管理后台</Link>
      </nav>
      <span className="topbar-note">广州出发 · 两个人</span>
    </header>
  );
}
