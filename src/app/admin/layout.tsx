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
          <span className="admin-nav-caption">WORKSPACE / 工作台</span>
          <Link href="/admin"><span>工作台</span></Link>
          <span className="admin-nav-caption">CONTENT / 内容管理</span>
          <Link href="/admin/destinations"><span>目的地</span></Link>
          <Link href="/admin/places"><span>旅行足迹</span></Link>
          <Link href="/admin/timeline"><span>旅行时间轴</span></Link>
          <span className="admin-nav-caption">PLANNING / 旅行数据</span>
          <Link href="/admin/plans"><span>旅行计划</span></Link>
          <Link href="/admin/flights"><span>机票记录</span></Link>
          <span className="admin-nav-caption">SYSTEM / 系统管理</span>
          <Link href="/admin/tokens"><span>AI 助手授权</span></Link>
          {user.role === "ADMIN" ? <Link href="/admin/settings"><span>站点设置</span></Link> : null}
          {user.role === "ADMIN" ? <Link href="/admin/users"><span>账号管理</span></Link> : null}
          {user.role === "ADMIN" ? <Link href="/admin/restore"><span>备份恢复</span></Link> : null}
          <span className="admin-nav-caption">ACCOUNT / 个人账户</span>
          <Link href="/admin/account"><span>修改密码</span></Link>
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