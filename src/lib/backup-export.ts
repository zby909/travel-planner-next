import "server-only";
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { PrismaClient } from "@prisma/client";
import { ZipFile } from "yazl";
import { prisma } from "@/lib/prisma";
import { restoreDataDir } from "@/lib/backup-restore";
import { getUploadDirectory } from "@/lib/media-storage";
import { MAX_BACKUP_ENTRIES, MAX_BACKUP_UNCOMPRESSED, MAX_BACKUP_ZIP, validBackupImagePath, type BackupFileEntry, type BackupManifest } from "@/lib/backup-format";

let exporting = false;

// 生成受大小约束的快照包；数据库写锁只覆盖快照与文件复制，不覆盖 ZIP 压缩和下载。
export async function createBackupArchive(actorId: string): Promise<{ bytes: Buffer; fileName: string }> {
  if (exporting) throw Error("已有备份正在生成，请稍后再试");
  exporting = true;
  const root = join(restoreDataDir(), "backup-exports");
  let folder = "";
  let source: PrismaClient | undefined;
  try {
    await mkdir(root, { recursive: true, mode: 0o700 });
    for (const entry of await readdir(root, { withFileTypes: true })) {
      const path = join(root, entry.name);
      if (entry.isDirectory() && entry.name.startsWith("export-") && Date.now() - (await stat(path)).mtimeMs > 24 * 3600_000) {
        await rm(path, { recursive: true, force: true });
      }
    }
    folder = await mkdtemp(join(root, "export-"));
    const files: BackupFileEntry[] = [];
    let total = 0;

    // 为每个文件保存校验和，禁止符号链接或超出恢复端限制的包。
    async function includeFile(path: string, name: string, copy = true): Promise<void> {
      const info = await lstat(path);
      if (!info.isFile() || info.isSymbolicLink()) throw Error("备份不支持符号链接或特殊文件");
      total += info.size;
      if (total > MAX_BACKUP_UNCOMPRESSED || files.length >= MAX_BACKUP_ENTRIES - 1) throw Error("备份超过网页恢复容量，请使用停机备份");
      if (info.size > (name === "travel.db" ? 100 : 18) * 1024 * 1024) throw Error("备份包含过大的文件，请使用停机备份");
      const target = join(folder, name);
      if (copy) {
        await mkdir(join(target, ".."), { recursive: true, mode: 0o700 });
        await copyFile(path, target);
      }
      const bytes = await readFile(target);
      files.push({ path: name, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
    }

    // 复制允许恢复的历史图片，绝不打包运行时配置、日志或恢复暂存目录。
    async function includeLegacy(directory: string, prefix: string): Promise<void> {
      const entries = await readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return [];
        throw error;
      });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) throw Error("历史图片目录含符号链接，无法安全备份");
        const name = `${prefix}/${entry.name}`;
        if (entry.isDirectory() && name.split("/").length < 6 && /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(entry.name)) {
          await includeLegacy(join(directory, entry.name), name);
        } else if (entry.isFile() && validBackupImagePath(name.slice("legacy-images/".length))) {
          await includeFile(join(directory, entry.name), name);
        }
      }
    }

    const [{ file: databaseFile }] = await prisma.$queryRaw<Array<{ file: string }>>`PRAGMA database_list`;
    source = new PrismaClient({ datasources: { db: { url: "file:" + databaseFile.replace(/\\/g, "/") } } });
    const snapshot = join(folder, "travel.db");
    await prisma.$transaction(async tx => {
      // 即使设置表为空，这条写语句也会取得 SQLite 写锁，阻止引用在复制期间变化。
      await tx.$executeRaw`UPDATE "AppSetting" SET "value" = "value" WHERE "key" = 'visibility'`;
      await source!.$executeRawUnsafe("VACUUM main INTO ?", snapshot);
      await includeFile(snapshot, "travel.db", false);
      const assets = await tx.mediaAsset.findMany({ select: { id: true, fileName: true } });
      for (const asset of assets) {
        if (!/^[a-f0-9-]{36}$/i.test(asset.id) || asset.fileName !== `${asset.id}.webp`) throw Error("存在不受管的媒体记录，请先核对图片数据");
        await includeFile(join(getUploadDirectory(), asset.fileName), `uploads/${asset.fileName}`).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") throw Error("有媒体记录缺少原始文件，未生成不完整的备份；请先修复图片");
          throw error;
        });
      }
      const legacyRoot = process.env.LEGACY_MEDIA_DIR || join(restoreDataDir(), "legacy-images");
      await includeLegacy(join(legacyRoot, "images"), "legacy-images/images");
      await tx.auditLog.create({ data: { actorId, action: "导出", entity: "整站备份", entityId: "site", summary: `数据库与 ${files.length - 1} 个媒体文件` } });
    }, { timeout: 120_000, maxWait: 5_000 });
    await source.$disconnect();
    source = undefined;

    const manifest: BackupManifest = { format: "travel-planner-backup", version: 1, createdAt: new Date().toISOString(), files };
    const archive = new ZipFile();
    const output = join(folder, "backup.zip");
    let zipBytes = 0;
    const limiter = new Transform({
      // 在压缩输出阶段限制包体，生成的 ZIP 一定可由网页恢复入口接收。
      transform(chunk: Buffer, _encoding, callback) {
        zipBytes += chunk.length;
        callback(zipBytes > MAX_BACKUP_ZIP ? new Error("ZIP 超过 48 MiB，请使用停机备份") : null, chunk);
      },
    });
    archive.on("error", error => limiter.destroy(error));
    const done = pipeline(archive.outputStream, limiter, createWriteStream(output, { flags: "wx", mode: 0o600 }));
    for (const file of files) archive.addFile(join(folder, file.path), file.path);
    archive.addBuffer(Buffer.from(JSON.stringify(manifest)), "backup.json");
    archive.end();
    await done;
    return { bytes: await readFile(output), fileName: `travel-backup-${manifest.createdAt.replace(/[:.]/g, "-")}.zip` };
  } finally {
    exporting = false;
    await source?.$disconnect();
    if (folder) await rm(folder, { recursive: true, force: true });
  }
}
