import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; changed?: string }> }) {
  if (await getCurrentUser()) redirect("/admin");
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Link className="brand" href="/"><span className="brand-mark">✳</span><span className="brand-name">下一站<small>THE NEXT JOURNEY</small></span></Link>
        <p className="eyebrow auth-eyebrow">OUR PRIVATE SPACE</p>
        <h1>欢迎回来。</h1>
        <p className="muted-copy">旅行展示页对所有人开放。管理目的地、机票和足迹，需要你或王颖的账号登录。</p>
        {(await searchParams).changed === "1" ? <p className="form-success" role="status">密码已更新。所有旧会话已注销，请使用新密码登录。</p> : null}
        <LoginForm error={(await searchParams).error} />
        <Link className="source-link" href="/">← 返回公开展示页</Link>
        <p className="muted-copy">账号由管理员在服务器上初始化，不提供公开注册。</p>
      </div>
    </main>
  );
}
