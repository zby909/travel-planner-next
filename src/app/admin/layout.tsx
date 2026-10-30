import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { getSiteSettings } from "@/lib/site-settings";

export const dynamic = "force-dynamic";

// 后台使用与公开摄影杂志一致的编辑室侧栏，不改变权限和业务操作。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireEditor(), getSiteSettings()]);
  return (
    <div className="admin-shell">
      <aside className="admin-bar">
        <Link className="brand" href="/admin"><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>THE EDITORIAL DESK</small></span></Link>
        <div className="admin-sidebar-heading"><span>PRIVATE EDITION</span><h2>旅行的，<br /><em>编辑室。</em></h2><p>收集照片，编排远方。<br />我们的故事，在这里继续。</p></div>
        <nav className="admin-nav" aria-label="后台导航">
          <span className="admin-nav-caption">THE CONTENTS / 内容管理</span>
          <Link href="/admin">01 <span>工作台</span></Link>
          <Link href="/admin/destinations">02 <span>目的地</span></Link>
          <Link href="/admin/places">03 <span>旅行足迹</span></Link>
          <Link href="/admin/flights">04 <span>机票记录</span></Link>
          <span className="admin-nav-caption">THE SETTINGS / 个人设置</span>
          {user.role === "ADMIN" ? <Link href="/admin/settings">05 <span>站点设置</span></Link> : null}
          {user.role === "ADMIN" ? <Link href="/admin/users">06 <span>账号管理</span></Link> : null}
          <Link href="/admin/account">07 <span>修改密码</span></Link>
          <Link href="/admin/tokens">08 <span>AI 授权</span></Link>
          {user.role === "ADMIN" ? <Link href="/admin/restore">09 <span>备份恢复</span></Link> : null}
        </nav>
        <div className="admin-side-footer">
          <Link href="/" className="admin-public-link">← 回到旅行杂志</Link>
          <div className="admin-identity"><span>{user.displayName}<small>EDITOR / {user.role}</small></span><form action={logoutAction}><button type="submit" className="admin-signout">退出</button></form></div>
        </div>
      </aside>
      <div className="admin-body">{children}</div>
    </div>
  );
}