import "server-only";

import { unlink } from "node:fs/promises";
import { join } from "node:path";

export const MEDIA_PREVIEW_WIDTHS = ["320", "640", "960"] as const;

// 返回持久化上传目录，兼容 Docker 挂载与本地开发。
export function getUploadDirectory(): string {
  return process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
}

// 返回派生缩略图的持久化缓存目录，与原图目录隔离且不参与整站备份。
export function getMediaCacheDirectory(): string {
  return join(getUploadDirectory(), ".cache");
}

// 返回指定媒体 ID 和宽度的缩略图缓存路径。
export function getMediaCachePath(id: string, width: string): string {
  return join(/* turbopackIgnore: true */ getMediaCacheDirectory(), `${id}-w${width}.webp`);
}

// 只清理本项目随机 UUID 命名的 WebP 原图及其派生缩略图，不接受数据库中的任意路径。
export async function removeStoredMediaFiles(fileNames: string[]): Promise<void> {
  const directory = getUploadDirectory();
  const safeNames = [...new Set(fileNames)].filter(name => /^[a-f0-9-]{36}\.webp$/i.test(name));
  await Promise.all(safeNames.flatMap(name => {
    const id = name.slice(0, -5);
    return [
      unlink(join(/* turbopackIgnore: true */ directory, name)).catch(() => {}),
      ...MEDIA_PREVIEW_WIDTHS.map(width => unlink(getMediaCachePath(id, width)).catch(() => {})),
    ];
  }));
}
