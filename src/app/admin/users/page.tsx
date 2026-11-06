import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountCreateForm } from "./user-form";

// 管理情侣旅行档案的私人编辑账号，只有管理员可以创建新的登录身份。
export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await requireEditor();
  if (me.role !== "ADMIN") notFound();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true, role: true, isActive: true } });
  const activeCount = users.filter(user => user.isActive).length;
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">ACCOUNT MANAGEMENT</p><h1>私人账号</h1><p>你和对象可以各自登录，共同维护这份旅行档案。只有管理员能新增编辑账号，不开放游客自助注册。</p></div>
    {(await searchParams).created === "1" ? <p className="form-success" role="status">账号创建成功，现在可以单独登录了。</p> : null}
    <section className="admin-panel"><h2>启用账号 · {activeCount}/2</h2><p className="muted-copy">恢复备份时停用的历史账号仅保留审计和照片归属，不占用登录名额；如同名，请为新成员使用不同登录名。</p>
      <div className="admin-list">{users.map(user => <div className="admin-list-item" key={user.id}><div><strong>{user.displayName}</strong><span>{user.username}</span></div><div><span>{user.role === "ADMIN" ? "管理员" : "编辑者"}</span><span>{user.isActive ? "启用" : "停用"}</span></div></div>)}</div>
    </section>
    {activeCount < 2 ? <AccountCreateForm /> : <section className="admin-panel"><h2>两位成员已就位</h2><p className="muted-copy">这个站点只供你们两个人使用。两位成员各自登录，共同维护同一份旅行档案；如需更换账号，请先通过运维流程处理，不开放第三个登录名。</p></section>}
  </main>;
}
