import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, mkdir, rename, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

// 在合并多篇旧日记前自动创建完整 SQLite 快照；失败则阻止迁移和应用启动。
export async function backupBeforePlaceNoteMigration(databaseUrl = process.env.DATABASE_URL) {
  if (!databaseUrl?.startsWith("file:")) throw Error("迁移前快照要求 DATABASE_URL 使用 SQLite file: 路径");
  const raw = databaseUrl.slice(5);
  const databaseFile = isAbsolute(raw) ? raw : resolve(process.cwd(), "prisma", raw);
  if (!existsSync(databaseFile)) return null;

  const database = new DatabaseSync(databaseFile, { readOnly: true });
  let temporary = "";
  try {
    if (!database.prepare("SELECT name FROM sqlite_master WHERE name = '_prisma_migrations'").get()) return null;
    if (database.prepare("SELECT name FROM sqlite_master WHERE name = 'TravelMemory'").get() &&
        !database.prepare("SELECT 1 FROM TravelMemory WHERE placeId IS NOT NULL LIMIT 1").get()) return null;
    if (database.prepare(
      "SELECT 1 FROM _prisma_migrations WHERE migration_name = ? AND finished_at IS NOT NULL LIMIT 1",
    ).get("20261106230000_one_note_per_place")) return null;

    const directory = join(dirname(databaseFile), "pre-migration-backups");
    const destination = join(directory, "before-one-note-per-place-20261107.db");
    if (existsSync(destination)) return destination;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    temporary = join(directory, `pending-${randomUUID()}.db`);
    database.prepare("VACUUM main INTO ?").run(temporary);
    await chmod(temporary, 0o600);
    await rename(temporary, destination);
    temporary = "";
    console.log(`迁移前 SQLite 快照已创建：${destination}`);
    return destination;
  } finally {
    database.close();
    if (temporary) await rm(temporary, { force: true });
  }
}

// 容器通过 Node 直接运行本脚本；可单独导入供隔离测试。
if (process.argv[1]?.endsWith("backup-before-place-note.mjs")) {
  await backupBeforePlaceNoteMigration();
}
