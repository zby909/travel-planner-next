import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";

const run = promisify(execFile);

// 只在隔离副本上运行仓库自带的迁移，拒绝未知版本和非本项目数据库。
export async function migrateBackupDatabase(path) {
  const db = new PrismaClient({ datasources: { db: { url: "file:" + path.replace(/\\/g, "/") } } });
  let pending;
  try {
    const integrity = await db.$queryRawUnsafe("PRAGMA integrity_check");
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") throw Error("备份数据库完整性检查失败");
    const customSchema = await db.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type IN ('trigger', 'view') OR sql LIKE 'CREATE VIRTUAL TABLE%'");
    if (customSchema.length) throw Error("备份含有本项目不支持的数据库对象");
    const applied = await db.$queryRawUnsafe('SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const known = (await readdir(resolve(process.cwd(), "prisma/migrations"), { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name);
    if (!applied.some(row => row.migration_name === "20261029100743_init") || applied.some(row => !known.includes(row.migration_name))) {
      throw Error("备份版本不兼容，请使用匹配或更新版本的应用恢复");
    }
    pending = applied.length !== known.length;
  } finally { await db.$disconnect(); }
  if (pending) {
    try {
      await run(process.execPath, [resolve(process.cwd(), "node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", resolve(process.cwd(), "prisma/schema.prisma")], {
        cwd: process.cwd(), env: { ...process.env, DATABASE_URL: "file:" + path.replace(/\\/g, "/") }, timeout: 60_000, windowsHide: true,
      });
    } catch { throw Error("旧版备份升级失败；当前站点未改变，请检查备份版本"); }
  }
  return pending;
}
