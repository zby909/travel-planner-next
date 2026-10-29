import { existsSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const file = resolve("data/admin-bootstrap-test.db");
const env = {
  ...process.env,
  DATABASE_URL: "file:../data/admin-bootstrap-test.db",
};
const node = process.execPath;

function cleanup() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
}
function run(args, processEnv) {
  const result = spawnSync(node, args, {
    env: processEnv, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(`Child test failed (exit ${result.status}): ${result.stderr.slice(-700)}`);
  }
}
let db;
try {
  cleanup();
  run(["node_modules/prisma/build/index.js", "migrate", "deploy"], env);
  const secret = "Test-only-" + randomBytes(20).toString("base64url");
  const setup = { ...env,
    BOOTSTRAP_ADMIN_USERNAME: "first_owner",
    BOOTSTRAP_ADMIN_DISPLAY_NAME: "临时管理员",
    BOOTSTRAP_ADMIN_PASSWORD: secret,
  };

  run(["scripts/bootstrap-admin.mjs"], setup);
  db = new PrismaClient({ datasources: { db: { url: "file:../data/admin-bootstrap-test.db" } } });
  const user = await db.user.findUnique({ where: { username: "first_owner" } });
  if (!user || user.role !== "ADMIN" || !user.passwordHash.startsWith("scrypt-v1:")) {
    throw new Error("Initial admin bootstrap did not create a hashed administrator account.");
  }
  const originalHash = user.passwordHash;
  run(["scripts/bootstrap-admin.mjs"], setup);
  const users = await db.user.count();
  const existing = await db.user.findUnique({ where: { username: "first_owner" } });
  if (users !== 1 || existing?.passwordHash !== originalHash) {
    throw new Error("Reboot re-created the account or replaced the password.");
  }
  run(["scripts/bootstrap-admin.mjs"], env);
  console.log("BOOTSTRAP_TEST_PASS: password not hardcoded, one-time creation, no password overwrite on restart");
} catch (error) {
  console.error("BOOTSTRAP_TEST_FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
  try { cleanup(); } catch {}
}
