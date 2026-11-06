export const MAX_BACKUP_ZIP = 48 * 1024 * 1024;
export const MAX_BACKUP_UNCOMPRESSED = 350 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 800;

export type BackupFileEntry = { path: string; size: number; sha256: string };
export type BackupManifest = {
  format: "travel-planner-backup";
  version: 1;
  createdAt: string;
  files: BackupFileEntry[];
};

// 上传和导出共用文件名白名单，不接受相对跳转或任意磁盘路径。
export function validBackupImagePath(path: string): boolean {
  const parts = path.split("/");
  return parts.length >= 2 && parts.length <= 5
    && parts.every(part => /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(part))
    && /\.(?:jpg|jpeg|png|webp|svg)$/i.test(parts[parts.length - 1]);
}
