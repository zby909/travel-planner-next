import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { getPartnerInviteStatus } from "@/lib/partner-invite";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";
import { AccountCreateForm, PartnerInvitePanel } from "./user-form";

// 管理情侣旅行档案的私人编辑账号，支持一次性邀请链接与手动创建。
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ created?: string; inviteRevoked?: string }> }) {
  const me = await requireEditor();
  if (me.role !== "ADMIN") notFound();
  const [users, settings, inviteStatus, query] = await Promise.all([
    prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true, role: true, isActive: true } }),
    getSiteSettings(),
    getPartnerInviteStatus(),
    searchParams,
  ]);
  const activeCount = users.filter(user => user.isActive).length;
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">成员账号</p><h1>成员与邀请</h1><p>你们两个人各自登录，共同维护同一份旅行手记。支持通过 24 小时一次性邀请链接让对方自己设密码，不开放游客注册。</p></div>
    {query.created === "1" ? <p className="form-success" role="status">账号创建成功，现在可以单独登录了。</p> : null}
    {query.inviteRevoked === "1" ? <p className="form-success" role="status">未使用的伴侣邀请链接已撤销。</p> : null}
    <section className="admin-panel"><h2>启用账号 · {activeCount}/2</h2><p className="muted-copy">恢复备份时停用的历史账号仅保留审计和照片归属，不占用登录名额；如同名，请为新成员使用不同登录名。</p>
      <div className="admin-list">{users.map(user => <div className="admin-list-item" key={user.id}><div><strong>{user.displayName}</strong><span>{user.username}</span></div><div><span>{user.role === "ADMIN" ? "管理员" : "编辑者"}</span><span>{user.isActive ? "启用" : "停用"}</span></div></div>)}</div>
    </section>
    {activeCount < 2 ? <>
      <PartnerInvitePanel defaultSuggestedName={settings.secondaryMemberName} existingInvite={inviteStatus} />
      <AccountCreateForm />
    </> : <section className="admin-panel"><h2>两位成员已就位</h2><p className="muted-copy">这个空间专供你们两个人使用，各自登录即可共同维护旅行手记与相册。</p></section>}
  </main>;
}
