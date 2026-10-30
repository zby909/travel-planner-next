import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const dbFile = resolve(root, "data", "auth-e2e.db");
const databaseUrl = "file:" + dbFile.replace(/\\/g, "/");
const env = { ...process.env, DATABASE_URL: databaseUrl };
const node = process.execPath;

function clean() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    const file = dbFile + suffix;
    if (existsSync(file)) unlinkSync(file);
  }
}
function run(label, args) {
  console.log(label);
  const result = spawnSync(node, args, { cwd: root, env, stdio: "inherit" });
  if (result.status !== 0) throw new Error(label + " failed with exit code " + result.status);
}
try {
  // The test database is an explicitly named disposable file; never touch data/travel.db.
  clean();
  run("TEST: Prisma migrate deploy", ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  run("TEST: generic synthetic fixtures", ["scripts/seed-test-fixtures.mjs"]);
  run("TEST: Chrome login and editor flows", ["scripts/test-auth-e2e.mjs"]);
  console.log("AUTH_E2E_SUCCEEDED");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  try {
    clean();
  } catch (error) {
    console.warn("Disposable test DB cleanup warning:", error instanceof Error ? error.message : String(error));
  }
}
