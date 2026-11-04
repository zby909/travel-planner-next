import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";
import { safeInternalPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// 登录页沿用摄影杂志视觉，并支持登录后返回刚才访问的私密页面。
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; changed?: string; next?: string }> }) {
  const query = await searchParams;
  const nextPath = safeInternalPath(query.next);
  const [user, settings] = await Promise.all([getCurrentUser(), getSiteSettings()]);
  if (user && ["ADMIN", "EDITOR"].includes(user.role)) redirect(nextPath);
  const brandContent = <><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>{settings.siteSubtitle}</small></span></>;
  return (
    <main className="auth-screen editorial-auth">
      <div className="editorial-auth-story">
        {settings.visibility === "PUBLIC" ? <Link className="brand" href="/">{brandContent}</Link> : <div className="brand">{brandContent}</div>}
        <div className="editorial-auth-quote"><p>THE PRIVATE EDITION / 001</p><h2>最好的旅行，<br /><em>一直在路上。</em></h2><span>FOR ALL THE STORIES WE HAVE YET TO WRITE.</span></div>
        <div className="editorial-auth-bottom">A TRAVEL JOURNAL FOR TWO <span>✳</span> MADE OF REAL MEMORIES</div>
      </div>
      <div className="auth-card">
        <div className="editorial-auth-top">PRIVATE ARCHIVE <span>MEMBERS ONLY / 01</span></div>
        <p className="eyebrow auth-eyebrow">WELCOME BACK, EDITOR</p>
        <h1>继续写下，<em>我们的故事。</em></h1>
        <p className="muted-copy">登录私人编辑室，更新心愿目的地、旅途照片和足迹记录。</p>
        {query.changed === "1" ? <p className="form-success" role="status">密码已更新。旧会话已经注销，请使用新密码登录。</p> : null}
        <LoginForm error={query.error} next={nextPath} />
        {settings.visibility === "PUBLIC" ? <Link className="source-link" href="/">← 返回公开旅行杂志</Link> : <p className="muted-copy">当前旅行空间仅对情侣成员开放，请登录后继续。</p>}
        <p className="muted-copy">仅限已有成员登录 · 暂不提供公开注册</p>
      </div>
    </main>
  );
}