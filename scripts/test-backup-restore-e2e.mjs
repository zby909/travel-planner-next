import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { createWriteStream } from "node:fs";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import yazl from "yazl";

const base = join(process.cwd(), "data", "restore-e2e");
const target = join(base, "target");
const source = join(base, "source");
const targetUrl = "file:" + join(target, "travel.db").replace(/\\/g, "/");
const sourceUrl = "file:" + join(source, "travel.db").replace(/\\/g, "/");
const host = "http://127.0.0.1:3018";
const token = randomBytes(32).toString("base64url");
const id = randomUUID();
const env = { ...process.env, DATABASE_URL: targetUrl, RESTORE_DATA_DIR: target, NODE_ENV: "development" };
let web;

function check(ok, message) { if (!ok) throw Error(message); }
function migrate(url) {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 60000,
  });
  check(result.status === 0, "migration failed: " + result.stderr.slice(-500));
}
function db(url) { return new PrismaClient({ datasources: { db: { url } } }); }
async function zipBackup() {
  const output = join(base, "restore-test.zip");
  const archive = new yazl.ZipFile();
  archive.addFile(join(source, "travel.db"), "travel.db");
  archive.addBuffer(Buffer.from("legacy-photo"), "legacy-images/images/visited/test.jpg");
  archive.addBuffer(Buffer.from("legacy-cover"), "legacy-images/images/test-island-0.jpg");
  archive.addBuffer(Buffer.from("<html>historical credits</html>"), "legacy-images/images/credits.html");
  archive.addBuffer(randomBytes(900 * 1024), "uploads/test.webp");
  archive.end();
  await new Promise((yes, no) => {
    archive.outputStream.pipe(createWriteStream(output)).on("close", yes).on("error", no);
  });
  return output;
}
async function request(path, options = {}, code = 200, authorized = true) {
  const headers = {
    Origin: host,
    ...(authorized ? { Cookie: "travel_session=" + token } : {}),
    ...options.headers,
  };
  const res = await fetch(host + path, { ...options, headers, signal: AbortSignal.timeout(20000) });
  const body = await res.json().catch(() => ({}));
  check(res.status === code, path + ": HTTP " + res.status + " instead of " + code + " " + JSON.stringify(body));
  return body;
}
async function chunkedPreview(bytes, filename, verifyResume = false) {
  const chunkSize = 512 * 1024;
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += chunkSize)
    chunks.push(bytes.subarray(offset, Math.min(bytes.length, offset + chunkSize)));
  const chunkHashes = chunks.map(chunk => createHash("sha256").update(chunk).digest("hex"));
  const metadata = {
    filename, size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), chunkHashes,
  };
  let session = await request("/api/admin/restore/upload/init", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata),
  });
  check(session.chunkCount === chunks.length, "Chunk count incorrect");
  if (verifyResume) {
    const firstHash = chunkHashes[0];
    await request("/api/admin/restore/upload/chunk", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Upload-Id": session.uploadId,
        "X-Chunk-Index": "0", "X-Chunk-SHA256": "0".repeat(64) },
      body: chunks[0],
    }, 400);
    await request("/api/admin/restore/upload/chunk", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Upload-Id": session.uploadId,
        "X-Chunk-Index": "0", "X-Chunk-SHA256": firstHash },
      body: chunks[0],
    });
    session = await request("/api/admin/restore/upload/init", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata),
    });
    check(session.resumed && session.receivedChunks.includes(0), "Interrupted upload did not resume from received chunk");
  }
  for (let index = 0; index < chunks.length; index++) {
    if (session.receivedChunks.includes(index)) continue;
    await request("/api/admin/restore/upload/chunk", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream", "X-Upload-Id": session.uploadId,
        "X-Chunk-Index": String(index), "X-Chunk-SHA256": chunkHashes[index] },
      body: chunks[index],
    });
  }
  return request("/api/admin/restore/upload/finalize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId: session.uploadId }),
  });
}
async function waitReady() {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(host + "/api/health", { signal: AbortSignal.timeout(1100) })).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 600));
  }
  throw Error("Next server was not ready");
}
async function startServer() {
  web = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3018", "--hostname", "127.0.0.1"], {
    cwd: process.cwd(), env, stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  web.stdout.on("data", c => { logs = (logs + c.toString()).slice(-2400); });
  web.stderr.on("data", c => { logs = (logs + c.toString()).slice(-2400); });
  await waitReady();
  return () => logs;
}
async function stopServer() {
  if (!web) return;
  const proc = web;
  web = null;
  proc.kill("SIGTERM");
  await Promise.race([
    new Promise(r => proc.once("exit", r)),
    new Promise(r => setTimeout(r, 2500)),
  ]);
  if (proc.exitCode === null) proc.kill("SIGKILL");
}
async function run() {
  await rm(base, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await mkdir(source, { recursive: true });
  migrate(targetUrl);
  migrate(sourceUrl);
  const targetDb = db(targetUrl);
  const sourceDb = db(sourceUrl);
  try {
    await targetDb.user.create({
      data: { id, username: "new_admin", displayName: "站点新管理员", role: "ADMIN", passwordHash: "scrypt-v1:new-hash" },
    });
    await targetDb.authSession.create({
      data: { userId: id, tokenHash: createHash("sha256").update(token).digest("hex"),
        expiresAt: new Date(Date.now() + 3600_000) },
    });
    const old = await sourceDb.user.create({
      data: { username: "old_owner", displayName: "旧管理员", role: "ADMIN", passwordHash: "unsafe-old-secret" },
    });
    await sourceDb.apiToken.create({
      data: { userId: old.id, title: "old-token", tokenHash: "old-hash", scopesJson: '["visits:write"]',
        expiresAt: new Date(Date.now() + 3600_000) },
    });
    await sourceDb.destination.create({
      data: {
        id: "test-island", title: "测试岛屿", subtitle: "虚构目的地", flag: "🏝️", kind: "旅行计划",
        typesJson: "[]", months: "8月", seasonsJson: "[]", days: "3天",
        minBudget: 1000, maxBudget: 1300, pickBudget: 1100, rank: 1,
        budgetFlight: 300, budgetHotel: 300, budgetGroup: 0, budgetFood: 250,
        budgetTickets: 100, budgetTransport: 100, budgetOther: 50,
        groupText: "", flightNote: "", vibe: "", reason: "", spotsJson: "[]", routeJson: "[]",
      },
    });
    await sourceDb.visitedPlace.create({
      data: { id: "test-visited", name: "测试小镇", region: "虚构省",
        group: "mine", image: "images/visited/test.jpg", whenLabel: "2024", sortOrder: 1 },
    });
  } finally { await sourceDb.$disconnect(); await targetDb.$disconnect(); }
  const backup = await zipBackup();
  await startServer();
  try {
    await request("/api/admin/restore/status", {}, 403, false);
    await request("/api/admin/restore/prepare", { method: "POST" }, 403, false);
    await request("/api/admin/restore/prepare", { method: "POST", headers: { Origin: "https://evil.example" } }, 403);
    await request("/api/admin/restore/upload/init", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }, 403, false);
    await request("/api/admin/restore/upload/init", { method: "POST", headers: { Origin: "https://evil.example", "Content-Type": "application/json" }, body: "{}" }, 403);
    const preview = await chunkedPreview(await readFile(backup), "restore-test.zip", true);
    check(preview.counts.places === 1 && preview.counts.destinations === 1 && preview.counts.users === 1,
      "Preview data counts incorrect");
    check(preview.images.legacy === 2 && preview.images.uploads === 1, "Restore archive photos missing");
    console.log("CHUNK_RESUME_PASS: upload interrupted after first chunk, server resumed remaining chunks");
    // Optional private compatibility check, enabled only by a locally supplied
    // file path. Never log, commit or upload real personal backup contents.
    if (process.env.PRIVATE_BACKUP_ZIP) {
      const privatePreview = await chunkedPreview(await readFile(process.env.PRIVATE_BACKUP_ZIP), "private-backup.zip");
      check(privatePreview.counts.places === 31 && privatePreview.counts.destinations === 14,
        "Private backup schema preview was not recognized");
      check(privatePreview.images.legacy >= 45, "Private backup media was not recognized");
      console.log("OPTIONAL_PRIVATE_BACKUP_SCHEMA_PASS: archive validated locally");
    }
    const unchanged = db(targetUrl);
    try { check((await unchanged.visitedPlace.count()) === 0, "Upload mutated live DB"); }
    finally { await unchanged.$disconnect(); }
    const applied = await request("/api/admin/restore/commit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: preview.id }),
    });
    check(applied.queued, "Restore queue was not created");
    await request("/api/admin/restore/commit", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: preview.id }),
    }, 409);
    check((await request("/api/admin/restore/status")).state === "PENDING_RESTART", "Restore status not queued");
  } finally { await stopServer(); }
  const apply = spawnSync(process.execPath, ["scripts/apply-pending-restore.mjs"], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 60000,
  });
  check(apply.status === 0, "Offline apply failed: " + apply.stderr + " " + apply.stdout);
  const finalDb = db(targetUrl);
  try {
    const admin = await finalDb.user.findUnique({ where: { id } });
    const old = await finalDb.user.findUnique({ where: { username: "old_owner" } });
    check(admin?.role === "ADMIN" && admin.isActive && admin.passwordHash === "scrypt-v1:new-hash",
      "Current admin not preserved");
    check(old && !old.isActive && old.role === "EDITOR", "Old admin still active");
    check((await finalDb.authSession.count()) === 0, "Old user sessions still active");
    check((await finalDb.apiToken.count()) === 0, "Old API tokens still active");
    check((await finalDb.destination.count()) === 1 && (await finalDb.visitedPlace.count()) === 1,
      "Travel data not restored");
  } finally { await finalDb.$disconnect(); }
  check((await readFile(join(target, "legacy-images", "images", "visited", "test.jpg"))).toString() === "legacy-photo",
    "Legacy photo not restored");
  check(existsSync(join(target, "restore-staging", "last-result.json")), "Restore result marker missing");
  check(existsSync(join(target, "restore-staging", JSON.parse((await readFile(join(target, "restore-staging", "last-result.json"))).toString()).id, "previous-db.db")),
    "Rollback copy of current database not preserved");
  const photoSession = randomBytes(32).toString("base64url");
  const relogin = db(targetUrl);
  try {
    await relogin.authSession.create({ data: {
      userId: id, tokenHash: createHash("sha256").update(photoSession).digest("hex"),
      expiresAt: new Date(Date.now() + 3600_000),
    } });
  } finally { await relogin.$disconnect(); }
  await startServer();
  try {
    const photo = await fetch(host + "/api/legacy-media/images/visited/test.jpg");
    const photoText = await photo.text();
    check(photo.status === 200 && photoText === "legacy-photo", "Public restored legacy image unavailable, HTTP " + photo.status + ": " + photoText.slice(0, 160));
    const status = await fetch(host + "/api/admin/restore/status", {
      headers: { Cookie: "travel_session=" + photoSession },
    });
    check(status.ok && (await status.json()).state === "APPLIED", "Restored admin status not shown");
  } finally { await stopServer(); }
  const again = spawnSync(process.execPath, ["scripts/apply-pending-restore.mjs"], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 60000,
  });
  check(again.status === 0, "Restore startup is not idempotent");
  // Inject a simulated crash between moving the old DB and moving the restored DB.
  const crashRoot = join(base, "simulated-power-loss");
  const crashId = randomUUID();
  const crashStage = join(crashRoot, "restore-staging", crashId);
  await mkdir(crashStage, { recursive: true });
  await copyFile(join(target, "travel.db"), join(crashStage, "previous-db.db"));
  const crashQueue = { id: crashId, ownerId: id, sha256: "simulated-checksum" };
  await writeFile(join(crashStage, "manifest.json"), JSON.stringify(crashQueue));
  await writeFile(join(crashRoot, "restore-staging", "pending.json"), JSON.stringify(crashQueue));
  const crashed = spawnSync(process.execPath, ["scripts/apply-pending-restore.mjs"], {
    cwd: process.cwd(), env: { ...env, RESTORE_DATA_DIR: crashRoot }, encoding: "utf8", timeout: 60000,
  });
  check(crashed.status === 0 && existsSync(join(crashRoot, "travel.db")),
    "Simulated interrupted restore did not put original database back");
  const failed = JSON.parse(await readFile(join(crashRoot, "restore-staging", "last-result.json"), "utf8"));
  check(failed.status === "FAILED", "Interrupted SQLite swap must not report success");
  console.log("BACKUP_RESTORE_E2E_PASS: auth, ZIP preview, restart, user/token isolation, photos, rollback, crash recovery");
}

try { await run(); }
catch (e) { console.error("BACKUP_RESTORE_E2E_FAIL:", e instanceof Error ? e.message : String(e)); process.exitCode = 1; }
finally { await stopServer(); await rm(base, { force: true, recursive: true }).catch(() => {}); }
