import { existsSync, rmSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { preserveTsconfig } from "./preserve-tsconfig.mjs";

const restoreTsconfig = preserveTsconfig();

const db = join(process.cwd(), "data", "import-e2e.db");
const images = join(process.cwd(), "data", "import-e2e-uploads");
const distDir = join(process.cwd(), ".next-import-e2e");
const databaseUrl = "file:" + db.replace(/\\/g, "/");
const env = { ...process.env, DATABASE_URL: databaseUrl, UPLOAD_DIR: images };
const node = process.execPath;
function clean() {
  for (const ext of ["", "-wal", "-shm", "-journal"]) { if (existsSync(db + ext)) unlinkSync(db + ext); }
  rmSync(images, { recursive: true, force: true });
  rmSync(distDir, { recursive: true, force: true });
}
function run(label, args) {
  console.log(label);
  const r = spawnSync(node, args, { stdio: "inherit", cwd: process.cwd(), env });
  if (r.status !== 0) throw new Error(label + " failed");
}
try {
  clean();
  run("Create ephemeral SQLite DB", ["scripts/deploy-database.mjs"]);
  run("Compile the TypeScript travelctl source", ["node_modules/typescript/bin/tsc", "-p", "cli/tsconfig.json"]);
  run("Create synthetic test fixtures", ["scripts/seed-test-fixtures.mjs"]);
  run("Run HTTP and CLI import E2E", ["scripts/test-import-e2e.mjs"]);
  console.log("IMPORT_TESTS_SUCCEEDED");
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally {
  restoreTsconfig();
  try { clean(); }
  catch (error) { console.warn("Disposable import test cleanup warning:", error instanceof Error ? error.message : String(error)); }
}
