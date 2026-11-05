import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";
import { getSiteSettings } from "@/lib/site-settings";
import { AdminNavigation } from "./admin-navigation";

export const dynamic = "force-dynamic";

// 后台使用与公开摄影杂志一致的编辑室侧栏，不改变权限和业务操作。
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [user, settings] = await Promise.all([requireEditor(), getSiteSettings()]);
  return (
    <div className="admin-shell">
      <aside className="admin-bar">
        <Link className="brand" href="/admin"><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>THE EDITORIAL DESK</small></span></Link>
        <div className="admin-sidebar-heading"><span>PRIVATE EDITION</span><h2>旅行的，<br /><em>编辑室。</em></h2><p>收集照片，编排远方。<br />我们的故事，在这里继续。</p></div>
        <AdminNavigation role={user.role} />
        <div className="admin-side-footer">
          <Link href="/" className="admin-public-link">← 回到旅行杂志</Link>
          <div className="admin-identity"><span>{user.displayName}<small>EDITOR / {user.role}</small></span><form action={logoutAction}><button type="submit" className="admin-signout">退出</button></form></div>
        </div>
      </aside>
      <div className="admin-body">{children}</div>
    </div>
  );
}