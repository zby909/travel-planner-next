import "server-only";

import { unlink } from "node:fs/promises";
import { join } from "node:path";

// 返回持久化上传目录，兼容 Docker 挂载与本地开发。
export function getUploadDirectory(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
}

// 只清理本项目随机 UUID 命名的 WebP 文件，不接受数据库中的任意路径。
export async function removeStoredMediaFiles(fileNames: string[]): Promise<void> {
  const directory = getUploadDirectory();
  const safeNames = [...new Set(fileNames)].filter(name => /^[a-f0-9-]{36}\.webp$/i.test(name));
  await Promise.all(safeNames.map(name => unlink(join(/* turbopackIgnore: true */ directory, name)).catch(() => {})));
}
