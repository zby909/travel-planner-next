import "server-only";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, open, readFile, writeFile, rm, stat, readdir } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import { PrismaClient } from "@prisma/client";
import yauzl, { type Entry } from "yauzl";
import { prisma } from "@/lib/prisma";
import { BACKUP_SIZE_LABEL, MAX_BACKUP_ENTRIES as MAX_ENTRIES, MAX_BACKUP_MANIFEST, MAX_BACKUP_UNCOMPRESSED as MAX_UNCOMPRESSED, MAX_BACKUP_ZIP, MAX_DIRECT_BACKUP_ZIP, validBackupImagePath } from "@/lib/backup-format";
import { validateBackupManifest } from "@/lib/backup-manifest";
import { migrateBackupDatabase } from "../../scripts/migrate-backup.mjs";
import { fileChecksum } from "../../scripts/file-checksum.mjs";

export type BackupPreview = {
  id: string;
  createdAt: string;
  expiresAt: string;
  sha256: string;
  counts: { destinations: number; places: number; timeline: number; users: number; photos: number; plans: number; memories: number; expenses: number };
  images: { legacy: number; uploads: number };
  warnings: string[];
  status: "PREPARED";
};

export function restoreDataDir() {
  if (process.env.RESTORE_DATA_DIR) return resolve(process.env.RESTORE_DATA_DIR);
  return process.env.DATABASE_URL?.startsWith("file:/app/data/") ? "/app/data" : join(process.cwd(), "data");
}
export const restoreRoot = () => join(restoreDataDir(), "restore-staging");

function isZipDirectory(name: string) {
  return name.endsWith("/") && !name.includes("\\") && name.split("/").every(x => x === "" || /^[A-Za-z0-9_.-]+$/.test(x));
}
// 大包直接从临时文件解压，沿用路径、条目和大小校验。
async function unzipToStaging(source: Buffer | string, folder: string) {
  const openZip = await new Promise<yauzl.ZipFile>((yes, no) =>
    typeof source === "string"
      ? yauzl.open(source, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (err, zip) => err ? no(err) : yes(zip!))
      : yauzl.fromBuffer(source, { lazyEntries: true, validateEntrySizes: true, decodeStrings: true }, (err, zip) => err ? no(err) : yes(zip!)),
  );
  let entries = 0;
  let total = 0;
  let hasDb = false;
  let legacy = 0;
  const uploads = new Map<string, number>();
  const extracted: string[] = [];
  try {
    await new Promise<void>((done, fail) => {
      let settled = false;
      const reject = (e: unknown) => { if (!settled) { settled = true; openZip.close(); fail(e); } };
      openZip.on("error", reject);
      openZip.on("end", () => { if (!settled) { settled = true; done(); } });
      openZip.on("entry", (entry: Entry) => {
        void (async () => {
          entries++;
          if (entries > MAX_ENTRIES) throw Error("压缩包文件数量超过限制");
          const name = entry.fileName;
          if (!name || name.includes("\\") || name.includes("\0") || name.startsWith("/") || name.split("/").some(p => p === ".." || p === "."))
            throw Error("压缩包包含非法文件路径");
          const unixType = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (unixType === 0xa000) throw Error("不能导入符号链接");
          if (name.endsWith("/")) {
            if (!isZipDirectory(name)) throw Error("非法目录");
            return;
          }
          total += entry.uncompressedSize;
          if (total > MAX_UNCOMPRESSED) throw Error("解压后数据超出 2 GiB 限制");
          const isDb = name === "travel.db";
          const isManifest = name === "backup.json";
          const isLegacy = name.startsWith("legacy-images/images/") && validBackupImagePath(name.slice("legacy-images/".length));
          const isUpload = name.startsWith("uploads/") && validBackupImagePath(name);
          // Historical seed scripts and documentation are never extracted or executed.
          const ignored = name === "BACKUP-README.txt" || name.startsWith("legacy-seed/")
            || (name.startsWith("legacy-images/images/") && (name.toLowerCase().endsWith(".json") || name.toLowerCase().endsWith(".html")));
          if (!isDb && !isManifest && !isLegacy && !isUpload && !ignored) throw Error("不支持的压缩包条目：" + name.slice(0, 100));
          if (ignored) return;
          if (isManifest && entry.uncompressedSize > MAX_BACKUP_MANIFEST) throw Error("备份清单过大");
          if (isDb && hasDb) throw Error("备份中存在多个数据库文件");
          if (isDb && entry.uncompressedSize > 100 * 1024 * 1024) throw Error("SQLite 数据库太大");
          if (!isDb && entry.uncompressedSize > 18 * 1024 * 1024) throw Error("单张图片太大");
          const target = join(folder, ...name.split("/"));
          if (!target.startsWith(folder + sep)) throw Error("检测到路径越界");
          await mkdir(join(target, ".."), { recursive: true, mode: 0o700 });
          const input = await new Promise<NodeJS.ReadableStream>((yes, no) =>
            openZip.openReadStream(entry, (err, stream) => err ? no(err) : yes(stream!)),
          );
          let outputBytes = 0;
          const limiter = new Transform({
            transform(chunk: Buffer, _encoding, callback) {
              outputBytes += chunk.length;
              if (outputBytes > entry.uncompressedSize)
                callback(new Error("压缩包解压大小异常"));
              else callback(null, chunk);
            },
          });
          await pipeline(input, limiter, createWriteStream(target, { flags: "wx", mode: 0o600 }));
          if (outputBytes !== entry.uncompressedSize) throw Error("压缩包文件不完整");
          extracted.push(name);
          if (isDb) hasDb = true;
          if (isLegacy) legacy++;
          if (isUpload) uploads.set(name, outputBytes);
        })().then(() => openZip.readEntry()).catch(reject);
      });
      openZip.readEntry();
    });
  } finally { openZip.close(); }
  if (!hasDb) throw Error("备份 ZIP 必须包含根目录的 travel.db");
  await validateBackupManifest(folder, extracted);
  return { legacy, uploads, hasManifest: extracted.includes("backup.json") };
}

async function inspectDatabase(path: string, uploads: ReadonlyMap<string, number>) {
  const db = new PrismaClient({ datasources: { db: { url: "file:" + path.replace(/\\/g, "/") } } });
  try {
    const quick = await db.$queryRawUnsafe<Array<Record<string, string>>>("PRAGMA integrity_check");
    if (quick.length !== 1 || Object.values(quick[0])[0] !== "ok") throw Error("SQLite 完整性检查失败");
    const fk = await db.$queryRawUnsafe<Array<unknown>>("PRAGMA foreign_key_check");
    if (fk.length) throw Error("SQLite 外键关系不完整");
    const [destinations, places, timeline, users, assets, plans, memories, expenses] = await Promise.all([
      db.destination.count(), db.visitedPlace.count(), db.timelineEntry.count(), db.user.count(),
      db.mediaAsset.findMany({ select: { id: true, fileName: true, byteSize: true } }),
      db.travelPlan.count(), db.travelMemory.count(), db.expense.count(),
    ]);
    await db.destination.findFirst({ select: { isArchived: true } });
    await db.visitedPlace.findFirst({ select: { isArchived: true } });
    // Verify that a bundle uses this application's schema rather than an unrelated SQLite file.
    await db.apiToken.count();
    await db.appSetting.count();
    const inconsistent = assets.filter(asset => !/^[a-f0-9-]{36}$/i.test(asset.id) || asset.fileName !== `${asset.id}.webp` ||
      uploads.get(`uploads/${asset.fileName}`) !== asset.byteSize).length;
    // 中间版本归档了原文但缺少照片归属，以旧手记编号确认是否仍有合并记录。
    const merged = await db.$queryRaw<Array<{ found: number }>>`
      SELECT 1 AS found FROM AppSetting s, json_each(CASE WHEN json_valid(s.value) THEN s.value ELSE '[]' END) note
      WHERE s.key = 'legacy_place_notes_20261107' AND note.type = 'object'
        AND NOT EXISTS (SELECT 1 FROM TravelMemory m WHERE m.id = json_extract(note.value, '$.id'))
      LIMIT 1`;
    return { counts: { destinations, places, timeline, users, photos: assets.length, plans, memories, expenses }, inconsistent, hasMergedNotes: merged.length > 0 };
  } finally { await db.$disconnect(); }
}
export async function isBlankForRestore() {
  const counts = await Promise.all([
    prisma.destination.count(), prisma.visitedPlace.count(), prisma.timelineEntry.count(),
    prisma.travelPlan.count(), prisma.travelPhoto.count(), prisma.mediaAsset.count(), prisma.travelMemory.count(),
  ]);
  return counts.every(n => n === 0);
}
export async function prepareRestore(file: File, userId: string): Promise<BackupPreview> {
  if (file.size > MAX_DIRECT_BACKUP_ZIP) throw Error("超过 48 MiB 的备份请使用网页分块上传");
  return prepareRestoreSource(Buffer.from(await file.arrayBuffer()), file.name, userId, file.size);
}

// 预览已逐块校验的临时 ZIP，数据库仍仅在隔离副本升级。
export async function prepareRestorePath(path: string, fileName: string, userId: string): Promise<BackupPreview> {
  return prepareRestoreSource(path, fileName, userId, (await stat(path)).size);
}

// 所有恢复入口共用隔离目录、旧库升级和预览授权。
async function prepareRestoreSource(source: Buffer | string, fileName: string, userId: string, size: number): Promise<BackupPreview> {
  if (!await isBlankForRestore()) throw Error("仅允许在没有旅行数据的新实例恢复；请先备份现有站点");
  if (size < 100 || size > MAX_BACKUP_ZIP) throw Error(`ZIP 大小需在 100 B 到 ${BACKUP_SIZE_LABEL} 之间`);
  if (!fileName.toLowerCase().endsWith(".zip")) throw Error("请选择 ZIP 备份文件");
  const root = restoreRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  try { await stat(join(root, "pending.json")); throw Error("已有等待重启的恢复任务"); }
  catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
  let latestId = "";
  try {
    const result = JSON.parse(await readFile(join(root, "last-result.json"), "utf8")) as { id: string };
    latestId = result.id;
  } catch {}
  let activeDrafts = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^[a-f0-9-]{36}$/.test(entry.name) || entry.name === latestId) continue;
    const folder = join(root, entry.name);
    const age = Date.now() - (await stat(folder)).mtimeMs;
    if (age > 2 * 60 * 60 * 1000) await rm(folder, { recursive: true, force: true });
    else activeDrafts++;
  }
  if (activeDrafts >= 2) throw Error("已有两个待确认的备份预览，请稍后再试");
  const id = randomUUID();
  const folder = join(root, id);
  await mkdir(folder, { mode: 0o700 });
  try {
    const extracted = await unzipToStaging(source, folder);
    const images = { legacy: extracted.legacy, uploads: extracted.uploads.size };
    const dbPath = join(folder, "travel.db");
    const handle = await open(dbPath, "r");
    try {
      const header = Buffer.alloc(16);
      await handle.read(header);
      if (header.toString() !== "SQLite format 3\0") throw Error("不是有效的 SQLite 数据库");
    } finally { await handle.close(); }
    const upgraded = await migrateBackupDatabase(dbPath);
    const { counts, inconsistent, hasMergedNotes } = await inspectDatabase(dbPath, extracted.uploads);
    if (inconsistent && extracted.hasManifest) throw Error("备份中的受管图片与数据库记录不符，请检查源站并重新导出");
    const { sha256 } = await fileChecksum(dbPath);
    const warnings: string[] = upgraded ? ["旧版数据库已在隔离副本完成升级，当前站点尚未改变"] : [];
    if (hasMergedNotes) warnings.push("部分旧日记编号仅见于合并存档。如需核对各篇原有的照片，请选用合并之前的备份。");
    if (counts.users) warnings.push(`备份含 ${counts.users} 个旧账号；恢复后旧账号和 Token 会失效，保留当前管理员账号`);
    if (counts.places && images.legacy === 0 && images.uploads === 0) warnings.push("备份中无图片，部分已到访地点可能显示占位图");
    if (inconsistent) warnings.push(`旧备份中有 ${inconsistent} 张受管图片缺失或与数据库记录不符，请核对原始照片`);
    const preview: BackupPreview = {
      id, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      sha256,
      counts, images, warnings, status: "PREPARED",
    };
    await writeFile(join(folder, "manifest.json"), JSON.stringify({ ...preview, ownerId: userId }), { flag: "wx", mode: 0o600 });
    const value = JSON.stringify({ at: preview.createdAt, sha256, photos: counts.photos });
    await prisma.appSetting.upsert({ where: { key: "lastBackupVerification" },
      create: { key: "lastBackupVerification", value }, update: { value } });
    return preview;
  } catch (err) { await rm(folder, { recursive: true, force: true }); throw err; }
}
export async function queueRestore(id: string, ownerId: string): Promise<BackupPreview> {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw Error("恢复任务 ID 不合法");
  if (!await isBlankForRestore()) throw Error("站点已有旅行资料，无法覆盖恢复");
  const root = restoreRoot();
  const raw = await readFile(join(root, id, "manifest.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw Error("恢复任务不存在、已超时或已处理");
    throw error;
  });
  const data = JSON.parse(raw) as BackupPreview & { ownerId: string };
  if (data.ownerId !== ownerId || data.status !== "PREPARED" || Date.now() > Date.parse(data.expiresAt))
    throw Error("恢复任务无效、超时或不属于当前用户");
  if ((await fileChecksum(join(root, id, "travel.db"))).sha256 !== data.sha256) throw Error("备份文件校验值已变化");
  // Atomic create: only one queue can exist for a running application.
  await writeFile(join(root, "pending.json"),
    JSON.stringify({ id, ownerId, queuedAt: new Date().toISOString(), sha256: data.sha256 }),
    { flag: "wx", mode: 0o600 });
  await prisma.auditLog.create({
    data: { actorId: ownerId, action: "排队恢复", entity: "整站备份", entityId: id, summary: `已确认待重启恢复：${data.counts.places} 个地点、${data.counts.destinations} 个目的地` },
  }).catch(() => {});
  return data;
}
export async function restoreStatus(_ownerId: string) {
  void _ownerId;
  const root = restoreRoot();
  for (const file of ["pending.json", "last-result.json"]) {
    try {
      const data = JSON.parse(await readFile(join(root, file), "utf8")) as Record<string, unknown>;
      return { ...data, state: file === "pending.json" ? "PENDING_RESTART" : data.status || "APPLIED" };
    } catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
  }
  return { state: "NONE" };
}
