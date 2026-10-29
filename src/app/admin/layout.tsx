import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireEditor();
  return (
    <div className="admin-shell">
      <header className="admin-bar">
        <Link className="brand" href="/admin"><span className="brand-mark">✳</span><span className="brand-name">旅行管理<small>OUR PRIVATE JOURNAL</small></span></Link>
        <nav className="admin-nav" aria-label="后台导航">
          <Link href="/admin">概览</Link>
          <Link href="/admin/destinations">目的地</Link>
          <Link href="/admin/flights">机票报价</Link>
          <Link href="/admin/places">足迹地点</Link>
          {user.role === "ADMIN" ? <Link href="/admin/users">账号管理</Link> : null}
          <Link href="/admin/account">修改密码</Link>
          <Link href="/admin/tokens">AI 授权</Link>
          {user.role === "ADMIN" ? <Link href="/admin/restore">备份恢复</Link> : null}
          <Link href="/">公开站点 ↗</Link>
        </nav>
        <div className="admin-identity">
          <span>{user.displayName}</span>
          <form action={logoutAction}><button type="submit" className="admin-signout">退出登录</button></form>
        </div>
      </header>
      <div className="admin-body">{children}</div>
    </div>
  );
}
