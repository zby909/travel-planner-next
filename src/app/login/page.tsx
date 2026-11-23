import Link from "next/link";
import "../studio.css";
import { redirect } from "next/navigation";
import { getCurrentUser, needsInitialSetup } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";
import { safeInternalPath } from "@/lib/safe-redirect";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

// 登录页沿用摄影杂志视觉；空白新实例会自动进入首次布置向导。
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; changed?: string; next?: string }> }) {
  const query = await searchParams;
  const nextPath = safeInternalPath(query.next);
  const [user, settings, needsSetup] = await Promise.all([getCurrentUser(), getSiteSettings(), needsInitialSetup()]);
  if (needsSetup) redirect("/setup");
  if (user && ["ADMIN", "EDITOR"].includes(user.role)) redirect(nextPath);
  const brandContent = <><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>{settings.siteSubtitle}</small></span></>;
  return (
    <main className="auth-screen editorial-auth">
      <div className="editorial-auth-story">
        {settings.visibility === "PUBLIC" ? <Link className="brand" href="/">{brandContent}</Link> : <div className="brand">{brandContent}</div>}
        <div className="editorial-auth-quote"><p>私人旅行档案</p><h2>最好的旅行，<br /><em>一直在路上。</em></h2><span>把去过的远方、照片与片刻心情安静地收在这里。</span></div>
        <div className="editorial-auth-bottom">两个人的旅行手记 <span>✳</span> 私有自托管</div>
      </div>
      <div className="auth-card">
        <div className="editorial-auth-top">成员登录 <span>仅限两位成员</span></div>
        <p className="eyebrow auth-eyebrow">欢迎回来</p>
        <h1>继续写下，<em>我们的故事。</em></h1>
        <p className="muted-copy">登录私人编辑室，记录新的足迹、上传旅行照片或规划下一段出发。</p>
        {query.changed === "1" ? <p className="form-success" role="status">密码已更新。旧会话已经注销，请使用新密码登录。</p> : null}
        <LoginForm error={query.error} next={nextPath} />
        {settings.visibility === "PUBLIC" ? <Link className="source-link" href="/">← 返回公开旅行杂志</Link> : <p className="muted-copy">当前旅行空间仅对成员开放，请登录后浏览。</p>}
        <p className="muted-copy">仅限受邀成员登录 · 不开放游客注册</p>
      </div>
    </main>
  );
}