import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RestoreBackupForm } from "./restore-form";
import { ExportBackupForm } from "./export-form";
import { BACKUP_SIZE_LABEL } from "@/lib/backup-format";

const EXPORT_ERROR_MESSAGES: Record<string, string> = {
  busy: "已有备份正在生成，请稍后再试。",
  oversize: `备份超过网页导出容量上限（${BACKUP_SIZE_LABEL}），请改用停机备份。`,
  "missing-media": "部分媒体文件缺失或与数据库记录不符，未生成不完整备份，请先核对图片。",
  "invalid-media": "媒体目录包含不受管文件或符号链接，无法安全打包，请先核对图片目录。",
  failed: "备份生成失败，请检查服务器存储空间与日志。",
};

// 运维记录来自设置表，旧备份中的损坏或缺失值保持为空。
function backupRecord(value: string | undefined): { at: string; bytes?: number } | null {
  try {
    const result = JSON.parse(value || "null");
    return result && typeof result.at === "string" && Number.isFinite(Date.parse(result.at)) ? result : null;
  } catch { return null; }
}

// 汇总当前媒体体量及最近成功生成和校验备份的时间。
export default async function RestorePage({ searchParams }: { searchParams: Promise<{ exportError?: string }> }) {
  const user = await requireEditor();
  if (user.role !== "ADMIN") notFound();
  const { exportError } = await searchParams;
  const [places, destinations, timeline, plans, memories, photos, media, records] = await Promise.all([
    prisma.visitedPlace.count(), prisma.destination.count(),
    prisma.timelineEntry.count(), prisma.travelPlan.count(),
    prisma.travelMemory.count(), prisma.travelPhoto.count(),
    prisma.mediaAsset.aggregate({ _sum: { byteSize: true }, _count: true }),
    prisma.appSetting.findMany({ where: { key: { in: ["lastBackupExport", "lastBackupVerification"] } } }),
  ]);
  const values = new Map(records.map(row => [row.key, row.value]));
  const exported = backupRecord(values.get("lastBackupExport"));
  const verified = backupRecord(values.get("lastBackupVerification"));
  const hasData = [places, destinations, timeline, plans, memories, photos, media._count].some(count => count > 0);
  const extras = [
    ...(memories ? [`${memories} 篇手记`] : []),
    ...(photos ? [`${photos} 张相册照片`] : []),
    ...(media._count ? [`${media._count} 个受管图片`] : []),
  ];
  return <main>
    <div className="admin-page-heading">
      <p className="eyebrow">FIRST SETUP · BACKUP RESTORE</p>
      <h1>备份与恢复</h1>
      <p>将旅行记录和照片一起下载保存；迁移时在空白新实例上传、校验并恢复。</p>
    </div>
    <section className="admin-panel" aria-label="备份状态">
      <div className="admin-form-grid">
        <div><h2>受管图片</h2><p>{media._count} 张 · {((media._sum.byteSize ?? 0) / 1024 ** 2).toFixed(1)} MiB</p></div>
        <div><h2>最近生成备份</h2><p>{exported ? `${exported.at.slice(0, 16).replace("T", " ")} UTC` : "暂无生成记录"}</p></div>
        <div><h2>最近通过恢复校验</h2><p>{verified ? `${verified.at.slice(0, 16).replace("T", " ")} UTC` : "暂无校验记录"}</p></div>
      </div>
      <p className="muted-copy">网页整站备份容量为 {BACKUP_SIZE_LABEL}。受管图片统计包含回收站照片，旧版独立配图会随备份另行打包。生成记录表示服务器已打包完成，文件下载情况请在浏览器中确认。</p>
    </section>
    <ExportBackupForm error={typeof exportError === "string" ? EXPORT_ERROR_MESSAGES[exportError] : undefined} />
    {hasData && <section className="admin-panel">
      <h2>站点已有旅行记录</h2>
      <p className="muted-copy">目前有 {places} 个足迹、{destinations} 个未来目的地、{timeline} 条时间轴、{plans} 个旅行计划{extras.length ? `（另含 ${extras.join("、")}）` : ""}。为了防止覆盖已有内容，网页整站恢复仅允许在空白新实例进行。需要迁移现有站点时，请先创建独立空白实例。</p>
    </section>}
    <RestoreBackupForm allowUpload={!hasData} />
    <section className="admin-panel">
      <h2>恢复如何生效？</h2>
      <p className="muted-copy">上传 → 数据库校验与预览 → 管理员确认 → 重启当前 Docker 容器或应用服务 → 启动前自动恢复数据与图片。</p>
      <p className="muted-copy">只接收本应用兼容的 SQLite 数据库。恢复后会保留当前新站点管理员的用户名、显示名称和密码；备份中的用户账号会被停用，登录会话和 API Token 不会恢复。恢复失败时会保留当前数据库并显示错误。</p>
    </section>
  </main>;
}
