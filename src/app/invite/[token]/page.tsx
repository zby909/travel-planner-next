import Link from "next/link";
import "../../studio.css";
import { inspectPartnerInvite } from "@/lib/partner-invite";
import { getSiteSettings } from "@/lib/site-settings";
import { AcceptInviteForm } from "./invite-form";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "接受邀请｜两个人的旅行手记",
  robots: { index: false, follow: false },
};

// 伴侣邀请落地页：仅当一次性邀请有效且仍有空余名额时允许创建第二个账号。
export default async function PartnerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, settings] = await Promise.all([inspectPartnerInvite(token), getSiteSettings()]);

  return (
    <main className="auth-screen editorial-auth">
      <div className="editorial-auth-story">
        <div className="brand"><span className="brand-mark">✳</span><span className="brand-name">{settings.siteName}<small>{settings.siteSubtitle}</small></span></div>
        <div className="editorial-auth-quote">
          <p>伴侣专属邀请</p>
          <h2>一起写下，<br /><em>属于我们的远方。</em></h2>
          <span>各自登录，共同珍藏每一次出发的足迹与照片。</span>
        </div>
        <div className="editorial-auth-bottom">两个人的旅行手记 <span>✳</span> 私有自托管</div>
      </div>
      <div className="auth-card">
        <div className="editorial-auth-top">成员邀请 <span>24 小时一次性有效</span></div>
        {invite ? (
          <>
            <p className="eyebrow auth-eyebrow">欢迎加入</p>
            <h1>{invite.inviterName} 邀请你<em>共同记录。</em></h1>
            <p className="muted-copy">为自己设置独立的登录账号和密码。注册完成后，这条邀请链接会立刻失效。</p>
            <AcceptInviteForm token={token} defaultDisplayName={invite.suggestedName || settings.secondaryMemberName} />
          </>
        ) : (
          <>
            <p className="eyebrow auth-eyebrow">链接已失效</p>
            <h1>这条邀请已经<em>过期或被使用。</em></h1>
            <p className="muted-copy">一次性邀请仅在 24 小时内有效，且使用后自动销毁。如需重新加入，请让管理员在「成员账号」页生成新的邀请链接。</p>
            <Link className="button button-dark" href="/login">前往登录页</Link>
          </>
        )}
      </div>
    </main>
  );
}
