import { existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { rmSync } from "node:fs";

const db = join(process.cwd(), "data", "import-e2e.db");
const images = join(process.cwd(), "data", "import-e2e-uploads");
const env = { ...process.env, DATABASE_URL: "file:../data/import-e2e.db", UPLOAD_DIR: images };
const node = process.execPath;
function clean() {
  for (const ext of ["", "-wal", "-shm", "-journal"]) { if (existsSync(db + ext)) unlinkSync(db + ext); }
  rmSync(images, { recursive: true, force: true });
}
function run(label, args) {
  console.log(label);
  const r = spawnSync(node, args, { stdio: "inherit", cwd: process.cwd(), env });
  if (r.status !== 0) throw new Error(label + " failed");
}
try {
  clean();
  run("Create ephemeral SQLite DB", ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  run("Import existing seed into ephemeral DB", ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"]);
  run("Run HTTP and CLI import E2E", ["scripts/test-import-e2e.mjs"]);
  console.log("IMPORT_TESTS_SUCCEEDED");
} catch (e) { console.error(e.message); process.exitCode = 1; }
finally { clean(); }
