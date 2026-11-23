import { BACKUP_SIZE_LABEL } from "@/lib/backup-format";

// 使用浏览器的原生下载流，手机也能直接保存整站备份。
export function ExportBackupForm({ error }: { error?: string }) {
  return <form action="/api/admin/backup" method="post" className="admin-panel" id="export-backup">
    <h2>导出旅行档案</h2>
    <p className="muted-copy">将记录、照片和账号资料打包成 ZIP，保存在自己的设备。浏览器会在打包完成后开始下载，单份上限 {BACKUP_SIZE_LABEL}。</p>
    <button className="button button-dark" type="submit">生成并下载备份 ZIP</button>
    {error && <p className="form-error" role="alert">{error}</p>}
  </form>;
}
