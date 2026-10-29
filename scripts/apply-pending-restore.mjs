import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const data = process.env.RESTORE_DATA_DIR
  ? resolve(process.env.RESTORE_DATA_DIR)
  : process.env.DATABASE_URL?.startsWith("file:/app/data/") ? "/app/data" : join(process.cwd(), "data");
const root = join(data, "restore-staging");
const pendingPath = join(root, "pending.json");
const dbPath = join(data, "travel.db");

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
    // Last launch may have swapped the DB but terminated before the marker was cleared.
    console.log("Restored database already rotated, finishing pending marker.");
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
    const [places, destinations, timeline, media, plans, photos, flights] = await Promise.all([
      currentDb.visitedPlace.count(), currentDb.destination.count(),
      currentDb.timelineEntry.count(), currentDb.mediaAsset.count(),
      currentDb.travelPlan.count(), currentDb.travelPhoto.count(),
      currentDb.flightPriceSample.count(),
    ]);
    if (places || destinations || timeline || media || plans || photos || flights)
      throw Error("当前站点已新增旅行数据，取消自动覆盖并保留原数据库");
    await currentDb.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { await currentDb.$disconnect(); }

  await copyFile(input, newFile);
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

  // Preflight all media destinations before moving any file, to prevent partial
  // copies from causing a retry to fail on conflicting filenames.
  const legacySrc = join(dir, "legacy-images");
  const uploadSrc = join(dir, "uploads");
  if (existsSync(uploadSrc)) {
    const uploadDir = join(data, "uploads");
    for (const name of await readdir(uploadSrc)) {
      if (existsSync(join(uploadDir, name))) throw Error("已有同名的上传媒体文件，拒绝覆盖：" + name);
    }
  }
  if (existsSync(legacySrc)) {
    const existing = join(data, "legacy-images");
    if (existsSync(existing)) {
      if ((await readdir(existing)).length) throw Error("历史图片目录非空，拒绝覆盖");
      await rm(existing, { recursive: true, force: true });
    }
    await cp(legacySrc, existing, { recursive: true, force: false, errorOnExist: true });
  }
  if (existsSync(uploadSrc)) {
    const target = join(data, "uploads");
    await mkdir(target, { recursive: true, mode: 0o700 });
    for (const item of await readdir(uploadSrc)) {
      await cp(join(uploadSrc, item), join(target, item), { recursive: true, force: false, errorOnExist: true });
    }
  }
  // Rename on the same persistent filesystem; keep original DB for rollback.
  await rename(dbPath, original);
  try {
    await rename(newFile, dbPath);
  } catch (err) {
    await rename(original, dbPath);
    throw err;
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
    const pending = JSON.parse(await readFile(pendingPath, "utf8"));
    await writeFile(join(root, "last-result.json"), JSON.stringify({
      id: pending.id, ownerId: pending.ownerId, status: "FAILED",
      error: error instanceof Error ? error.message : String(error), completedAt: new Date().toISOString(),
    }), { mode: 0o600 });
    await rm(pendingPath, { force: true });
  } catch {}
  // A rejected backup must not take an otherwise healthy site offline.
  // The failure status is available to the administrator after normal startup.
  process.exitCode = 0;
}
