import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { backupBeforePlaceNoteMigration } from "./backup-before-place-note.mjs";
import { sqliteDatabasePath } from "./sqlite-path.mjs";

// 新实例先建立空 SQLite 文件，已有实例在同一入口完成快照和迁移。
const args = process.argv.slice(2);
if (!args.includes("--help") && !args.includes("-h")) {
  if (!process.env.DATABASE_URL && existsSync(".env")) process.loadEnvFile(".env");
  const flag = args.indexOf("--schema");
  const schema = resolve((flag >= 0 ? args[flag + 1] : args.find(arg => arg.startsWith("--schema="))?.slice(9)) || "prisma/schema.prisma");
  const file = sqliteDatabasePath(process.env.DATABASE_URL, statSync(schema).isDirectory() ? schema : dirname(schema));
  if (!existsSync(file)) {
    await mkdir(dirname(file), { recursive: true });
    const handle = await open(file, "a", 0o600);
    await handle.close();
  }
  await backupBeforePlaceNoteMigration("file:" + file.replaceAll("\\", "/"));
}
const migration = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", ...args], { stdio: "inherit" });
if (migration.error) throw migration.error;
process.exitCode = migration.status ?? 1;
