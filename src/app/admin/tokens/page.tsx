import { requireEditor } from "@/lib/auth";
import { parseJsonArray } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { TokenCreateForm, RevokeTokenForm } from "./token-form";
import { CliSetupGuide } from "./cli-setup-guide";

export default async function TokensPage() {
  const user = await requireEditor();
  const tokens = await prisma.apiToken.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const now = new Date();
  return <main>
    <div className="admin-page-heading">
      <p className="eyebrow">AI & CLI ACCESS</p><h1>AI 助手授权</h1>
      <p>创建只允许读取、导入足迹、导入未来旅行或上传图片的专用 Token。令牌不能登录网页或管理用户。</p>
    </div>
    <CliSetupGuide />
    <TokenCreateForm />
    <section className="admin-panel">
      <h2>已有令牌</h2>
      <div className="admin-list">
        {tokens.length === 0 ? <p className="muted-copy">还没有授权令牌。</p> : tokens.map(token => (
          <article key={token.id} className="admin-list-item">
            <div>
              <strong>{token.title}</strong>
              <span>{parseJsonArray(token.scopesJson).join(" · ") || "权限待确认"}</span>
              <span>过期：{token.expiresAt.toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} · 最近使用：{token.lastUsedAt?.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }) ?? "未使用"}</span>
            </div>
            <div>{token.revokedAt ? <span>已撤销</span> : token.expiresAt <= now ? <span>已过期</span> : <RevokeTokenForm id={token.id} title={token.title} />}</div>
          </article>
        ))}
      </div>
    </section>
  </main>;
}
