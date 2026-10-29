import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const file = join(process.cwd(), "data", "production-smoke.db");
const uploads = join(process.cwd(), "data", "production-smoke-uploads");
const databaseUrl = "file:../data/production-smoke.db";
const password = randomBytes(32).toString("base64url");
const env = {
  ...process.env,
  NODE_ENV: "production",
  DATABASE_URL: databaseUrl,
  BOOTSTRAP_ADMIN_USERNAME: "smoke_admin",
  BOOTSTRAP_ADMIN_DISPLAY_NAME: "测试管理员",
  BOOTSTRAP_ADMIN_PASSWORD: password,
  UPLOAD_DIR: uploads,
};

function cleanFiles() {
  for (const suffix of ["", "-wal", "-shm", "-journal"]) {
    try { rmSync(file + suffix, { force: true }); } catch {}
  }
  rmSync(uploads, { force: true, recursive: true });
}

function check(value, message) {
  if (!value) throw new Error(message);
}

function runMigrate() {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 60000,
  });
  if (result.status !== 0) throw new Error("Prisma migrate deploy failed: " + result.stderr.slice(-1000));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      srv.close(() => resolve(address.port));
    });
  });
}

async function launch(port) {
  const serverEnv = { ...env, PORT: String(port) };
  const child = spawn(process.execPath, ["scripts/start-container.mjs"], {
    cwd: process.cwd(),
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { logs = (logs + String(chunk)).slice(-12000); });
  }
  const origin = `http://127.0.0.1:${port}`;
  try {
    for (let n = 0; n < 90; n++) {
      check(child.exitCode === null, "Production server stopped early: " + logs.slice(-1400));
      try {
        const response = await fetch(origin + "/api/health", { signal: AbortSignal.timeout(1500) });
        if (response.ok) return { child, origin, logs: () => logs };
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 450));
    }
    throw new Error("Production server startup timed out: " + logs.slice(-2000));
  } catch (error) {
    await stop(child);
    throw error;
  }
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise(resolve => child.once("exit", resolve)),
    new Promise(resolve => setTimeout(resolve, 2500)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

let db;
try {
  check(process.env.NODE_ENV !== "production" || process.env.DATABASE_URL !== databaseUrl, "Do not run inside the production container");
  check(existsSync(join(process.cwd(), ".next", "BUILD_ID")), "Run npm run build before production smoke test");
  cleanFiles();
  mkdirSync(join(process.cwd(), "data"), { recursive: true });
  runMigrate();
  db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const port = await freePort();
  let app = await launch(port);
  try {
    const [admin, visits, destinations, seed] = await Promise.all([
      db.user.findUnique({ where: { username: "smoke_admin" } }),
      db.visitedPlace.count(),
      db.destination.count(),
      db.appSetting.findUnique({ where: { key: "legacy_seed_v1" } }),
    ]);
    check(admin && admin.role === "ADMIN" && admin.passwordHash.startsWith("scrypt-v1:"), "Admin did not auto-bootstrap on first start");
    check(visits === 0 && destinations === 0 && !seed, "Generic first deployment unexpectedly contains personal travel data");
    const home = await fetch(app.origin + "/");
    check(home.ok && (await home.text()).includes("还没有未来目的地"), "Generic empty home unavailable in production");
    const visitedPage = await fetch(app.origin + "/visited");
    check(visitedPage.ok, "Visited page unavailable in production");
    const tokenPage = await fetch(app.origin + "/admin/tokens", { redirect: "manual" });
    check(tokenPage.status === 307 || tokenPage.status === 302, "Admin token page was not protected");
    const badApi = await fetch(app.origin + "/api/v1/visits");
    check(badApi.status === 401, "Anonymous access to CLI data was not blocked");
  } finally {
    await stop(app.child);
  }

  const modifiedTitle = "持久化验证：重启之后原数据不变";
  await db.appSetting.create({ data: { key: "production_smoke_value", value: modifiedTitle } });
  const hash = (await db.user.findUniqueOrThrow({ where: { username: "smoke_admin" } })).passwordHash;
  app = await launch(port);
  try {
    const [persisted, admin] = await Promise.all([
      db.appSetting.findUnique({ where: { key: "production_smoke_value" } }),
      db.user.findUniqueOrThrow({ where: { username: "smoke_admin" } }),
    ]);
    check(persisted?.value === modifiedTitle, "Data was overwritten on restart");
    check(admin.passwordHash === hash, "Bootstrap reset existing password on restart");
    check((await fetch(app.origin + "/api/health")).ok, "Database health unavailable after restart");
  } finally {
    await stop(app.child);
  }
  console.log("PRODUCTION_SMOKE_PASS: migrations, empty generic database, initial admin, auth, persistence");
} catch (error) {
  console.error("PRODUCTION_SMOKE_FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await db?.$disconnect();
  cleanFiles();
}
