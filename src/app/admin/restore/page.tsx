import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RestoreBackupForm } from "./restore-form";

export default async function RestorePage() {
  const user = await requireEditor();
  if (user.role !== "ADMIN") notFound();
  const [places, destinations, timeline, plans] = await Promise.all([
    prisma.visitedPlace.count(), prisma.destination.count(),
    prisma.timelineEntry.count(), prisma.travelPlan.count(),
  ]);
  const hasData = places > 0 || destinations > 0 || timeline > 0 || plans > 0;
  return <main>
    <div className="admin-page-heading">
      <p className="eyebrow">FIRST SETUP · BACKUP RESTORE</p>
      <h1>恢复旅行数据</h1>
      <p>首次部署可以直接上传原站的 SQLite 与图片备份包。无需进入容器手动复制文件。</p>
    </div>
    {hasData && <section className="admin-panel">
      <h2>站点已有旅行记录</h2>
      <p className="muted-copy">目前有 {places} 个足迹、{destinations} 个未来目的地、{timeline} 条时间轴。为了防止覆盖已有内容，网页整站恢复仅允许在空白新实例进行。需要迁移现有站点时，请先创建独立空白实例。</p>
    </section>}
    <RestoreBackupForm allowUpload={!hasData} />
    <section className="admin-panel">
      <h2>恢复如何生效？</h2>
      <p className="muted-copy">上传 → 数据库校验与预览 → 管理员确认 → 在 StackNest 重启 Docker 应用 → 自动恢复数据与图片。</p>
      <p className="muted-copy">只接收本应用兼容的 SQLite 数据库。恢复后会保留当前新站点管理员的用户名、显示名称和密码；备份中的用户账号会被停用，登录会话和 API Token 不会恢复。恢复失败时会保留当前数据库并显示错误。</p>
    </section>
  </main>;
}
