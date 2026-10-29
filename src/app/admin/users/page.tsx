import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AccountCreateForm } from "./user-form";

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const me = await requireEditor();
  if (me.role !== "ADMIN") notFound();
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, username: true, displayName: true, role: true, isActive: true } });
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">ACCOUNT MANAGEMENT</p><h1>私人账号</h1><p>不同成员可使用各自的账号，只有管理员能新增编辑账号，不支持游客自助注册。</p></div>
    {(await searchParams).created === "1" ? <p className="form-success" role="status">账号创建成功，现在可以单独登录了。</p> : null}
    <section className="admin-panel"><h2>现有账号</h2>
      <div className="admin-list">{users.map(user => <div className="admin-list-item" key={user.id}><div><strong>{user.displayName}</strong><span>{user.username}</span></div><div><span>{user.role === "ADMIN" ? "管理员" : "编辑者"}</span><span>{user.isActive ? "启用" : "停用"}</span></div></div>)}</div>
    </section>
    <AccountCreateForm />
  </main>;
}
