import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, readFile, rename, rm, writeFile } from "node:fs/promises";
import { migrateBackupDatabase } from "./migrate-backup.mjs";
import { installRestoreMedia, rollbackRestoreMedia } from "./restore-media.mjs";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const data = process.env.RESTORE_DATA_DIR
  ? resolve(process.env.RESTORE_DATA_DIR)
  : process.env.DATABASE_URL?.startsWith("file:/app/data/") ? "/app/data" : join(process.cwd(), "data");
const root = join(data, "restore-staging");
const pendingPath = join(root, "pending.json");
const dbPath = join(data, "travel.db");
let databaseSwitched = false;

// 启动前应用已确认的恢复任务，保留当前管理员并在切换失败时回退。
async function apply() {
  if (!existsSync(pendingPath)) return;
  const pending = JSON.parse(await readFile(pendingPath, "utf8"));
  if (!/^[a-f0-9-]{36}$/.test(pending.id) || typeof pending.ownerId !== "string") throw Error("恢复任务编号非法");
  const dir = join(root, pending.id);
  const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
  if (manifest.id !== pending.id || manifest.ownerId !== pending.ownerId || manifest.sha256 !== pending.sha256)
    throw Error("待恢复任务与预览记录不一致");
  const original = join(dir, "previous-db.db");
  const newFile = join(dir, "ready-db.db");
  const input = join(dir, "travel.db");
  if (existsSync(original)) {
    // Power loss after the first rename can leave travel.db temporarily absent.
    // Recover the original database instead of incorrectly declaring success.
    if (!existsSync(dbPath)) {
      await rename(original, dbPath);
      await rollbackRestoreMedia(dir, data);
      throw Error("数据库切换中断，已回退到原站点数据；请重新上传备份");
    }
    if (existsSync(newFile)) {
      throw Error("检测到未完成的数据库切换，保留原数据库，请人工检查恢复任务");
    }
    // An old DB copy plus a valid active DB, with no pending ready DB, means
    // that the swap finished but the success marker was interrupted.
    console.log("Restored database already rotated, finishing pending marker.");
    databaseSwitched = true;
    await writeFile(join(root, "last-result.json"), JSON.stringify({
      id: pending.id, ownerId: pending.ownerId, status: "APPLIED", completedAt: new Date().toISOString(),
    }), { mode: 0o600 });
    await rm(pendingPath, { force: true });
    return;
  }
  if (!existsSync(input) || !existsSync(dbPath)) throw Error("原数据库或上传的恢复数据库不存在");
  const actualSha = createHash("sha256").update(await readFile(input)).digest("hex");
  if (actualSha !== pending.sha256) throw Error("原始备份校验值不一致，拒绝恢复");
  const currentDb = new PrismaClient({ datasources: { db: { url: "file:" + dbPath.replace(/\\/g, "/") } } });
  let currentAdmin;
  try {
    currentAdmin = await currentDb.user.findUnique({ where: { id: pending.ownerId } });
    if (!currentAdmin?.isActive || currentAdmin.role !== "ADMIN") throw Error("启动前的管理员身份已失效");
    const [places, destinations, timeline, media, plans, photos, memories] = await Promise.all([
      currentDb.visitedPlace.count(), currentDb.destination.count(),
      currentDb.timelineEntry.count(), currentDb.mediaAsset.count(),
      currentDb.travelPlan.count(), currentDb.travelPhoto.count(), currentDb.travelMemory.count(),
    ]);
    if (places || destinations || timeline || media || plans || photos || memories)
      throw Error("当前站点已新增旅行数据，取消自动覆盖并保留原数据库");
    await currentDb.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { await currentDb.$disconnect(); }

  await copyFile(input, newFile);
  await migrateBackupDatabase(newFile);
  const newDb = new PrismaClient({ datasources: { db: { url: "file:" + newFile.replace(/\\/g, "/") } } });
  try {
    const check = await newDb.$queryRawUnsafe("PRAGMA integrity_check");
    if (check.length !== 1 || Object.values(check[0])[0] !== "ok") throw Error("恢复数据库损坏");
    await newDb.$transaction(async tx => {
      // Old password hashes, sessions and API tokens must never become active again.
      await tx.authSession.deleteMany();
      await tx.apiToken.deleteMany();
      await tx.importDraft.deleteMany();
      await tx.loginThrottle.deleteMany();
      await tx.user.updateMany({ data: { isActive: false, role: "EDITOR" } });
      const collision = await tx.user.findFirst({
        where: { username: currentAdmin.username, NOT: { id: currentAdmin.id } },
      });
      if (collision) await tx.user.update({
        where: { id: collision.id }, data: { username: "archived_" + collision.id.slice(0, 30), isActive: false },
      });
      await tx.appSetting.upsert({ where: { key: "admin_bootstrap_v1" }, update: { value: "completed" }, create: { key: "admin_bootstrap_v1", value: "completed" } });
      await tx.user.upsert({
        where: { id: currentAdmin.id },
        create: {
          id: currentAdmin.id, username: currentAdmin.username,
          displayName: currentAdmin.displayName, passwordHash: currentAdmin.passwordHash,
          role: "ADMIN", isActive: true,
        },
        update: {
          username: currentAdmin.username, displayName: currentAdmin.displayName,
          passwordHash: currentAdmin.passwordHash, role: "ADMIN", isActive: true,
        },
      });
    });
    await newDb.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { await newDb.$disconnect(); }

  const rollbackMedia = await installRestoreMedia(dir, data);
  // 先准备媒体，再在同一持久化文件系统切换数据库；切换失败撤回本任务图片。
  let switched = false;
  try {
    await rename(dbPath, original);
    try {
      await rename(newFile, dbPath);
      switched = true;
      databaseSwitched = true;
    } catch (err) {
      await rename(original, dbPath);
      throw err;
    }
  } catch (error) {
    if (!switched) await rollbackMedia();
    throw error;
  }
  for (const suffix of ["-wal", "-shm"]) await rm(dbPath + suffix, { force: true });
  await writeFile(join(root, "last-result.json"), JSON.stringify({
    id: pending.id, ownerId: pending.ownerId, status: "APPLIED", completedAt: new Date().toISOString(),
  }), { mode: 0o600 });
  await rm(pendingPath, { force: true });
  console.log("Backup restore applied: travel data and media restored, current administrator retained.");
}
try { await apply(); }
catch (error) {
  console.error("Backup restore failed:", error instanceof Error ? error.message : String(error));
  // Leave original database intact if the swap hasn't completed.
  // Record the error so that the administrator can troubleshoot after startup.
  try {
    if (databaseSwitched) {
      console.warn("数据库与图片已经切换；保留待处理标记，下次重启完成状态记录，不重复恢复。");
    } else {
      const pending = JSON.parse(await readFile(pendingPath, "utf8"));
      await writeFile(join(root, "last-result.json"), JSON.stringify({
        id: pending.id, ownerId: pending.ownerId, status: "FAILED",
        error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString(),
      }), { mode: 0o600 });
      await rm(pendingPath, { force: true });
    }
  } catch {}
  // A rejected backup must not take an otherwise healthy site offline.
  // The failure status is available to the administrator after normal startup.
  process.exitCode = 0;
}
