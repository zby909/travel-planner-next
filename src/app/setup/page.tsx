import { redirect } from "next/navigation";
import "../studio.css";
import { needsInitialSetup } from "@/lib/auth";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "首次布置｜两个人的旅行手记",
  robots: { index: false, follow: false },
};

// 空白实例首次打开时展示一站式初始化向导；已有账号后立即失效并跳转登录页。
export default async function SetupPage() {
  if (!(await needsInitialSetup())) redirect("/login");

  return (
    <main className="auth-screen editorial-auth">
      <div className="editorial-auth-story">
        <div className="brand"><span className="brand-mark">✳</span><span className="brand-name">我们的旅行手记<small>初次开启</small></span></div>
        <div className="editorial-auth-quote">
          <p>首次部署 · 一分钟布置</p>
          <h2>为两个人的旅程，<br /><em>留一册安静的档案。</em></h2>
          <span>照片、地图与手记都保存在你自己的服务器上。</span>
        </div>
        <div className="editorial-auth-bottom">私有自托管 <span>✳</span> 仅限两位成员共同记录</div>
      </div>
      <div className="auth-card">
        <div className="editorial-auth-top">首次初始化 <span>第 1 步 / 共 1 步</span></div>
        <p className="eyebrow auth-eyebrow">开始布置</p>
        <h1>开启你们的<em>旅行手记。</em></h1>
        <p className="muted-copy">创建首位管理员账号并选择空间隐私模式。完成后即可在后台生成一次性邀请链接，让另一半自己设置账号。</p>
        <SetupForm />
      </div>
    </main>
  );
}
