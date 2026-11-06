import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import yauzl from "yauzl";
import { ZipFile } from "yazl";

// 只在测试专用目录内创建或升级数据库。
function migrate(url, schema = resolve("prisma/schema.prisma")) {
  const result = spawnSync(process.execPath, [resolve("node_modules/prisma/build/index.js"), "migrate", "deploy", "--schema", schema], {
    cwd: process.cwd(), env: { ...process.env, DATABASE_URL: url }, encoding: "utf8", timeout: 60_000,
  });
  assert.equal(result.status, 0, result.stderr + result.stdout);
}

// 在内存中读取合成 ZIP，不执行或载入备份内的任何代码。
async function readZip(bytes) {
  const zip = await new Promise((yes, no) => yauzl.fromBuffer(bytes, { lazyEntries: true }, (err, value) => err ? no(err) : yes(value)));
  const entries = new Map();
  await new Promise((yes, no) => {
    zip.on("error", no);
    zip.on("end", yes);
    zip.on("entry", entry => {
      zip.openReadStream(entry, (err, stream) => {
        if (err) return no(err);
        const chunks = [];
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("error", no);
        stream.on("end", () => { entries.set(entry.fileName, Buffer.concat(chunks)); zip.readEntry(); });
      });
    });
    zip.readEntry();
  });
  return entries;
}

// 把测试文件集合重新打包，用于校验内容篡改和历史版本兼容性。
async function makeZip(entries) {
  const zip = new ZipFile();
  const chunks = [];
  const done = new Promise((yes, no) => {
    zip.outputStream.on("data", chunk => chunks.push(chunk));
    zip.outputStream.on("end", () => yes(Buffer.concat(chunks)));
    zip.outputStream.on("error", no);
    zip.on("error", no);
  });
  for (const [name, bytes] of entries) zip.addBuffer(bytes, name);
  zip.end();
  return done;
}

// 生成上一个版本的数据库，确认字段收敛不会丢失历史值。
async function oldVersionBackup(base) {
  const root = join(base, "old-version");
  const schemaDir = join(root, "prisma");
  await mkdir(join(schemaDir, "migrations"), { recursive: true });
  await cp(resolve("prisma/schema.prisma"), join(schemaDir, "schema.prisma"));
  for (const entry of await readdir(resolve("prisma/migrations"))) {
    if (entry === "20261106100000_close_lightweight_records") continue;
    await cp(resolve("prisma/migrations", entry), join(schemaDir, "migrations", entry), { recursive: true });
  }
  const path = join(root, "travel.db");
  const url = "file:" + path.replace(/\\/g, "/");
  migrate(url, join(schemaDir, "schema.prisma"));
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.travelPlan.create({ data: { id: "old-plan", title: "旧版旅行" } });
    await db.expense.create({ data: { id: "old-expense", planId: "old-plan", category: "FOOD", amountMinor: 10050, description: "旧版餐饮" } });
    await db.$executeRawUnsafe('UPDATE "TravelPlan" SET "actualBudget" = 1234 WHERE id = ?', "old-plan");
    await db.$executeRawUnsafe('UPDATE "Expense" SET "paidBy" = ?, "receiptPath" = ? WHERE id = ?', "合成付款人", "old-receipt", "old-expense");
    await db.$executeRawUnsafe('INSERT INTO "TravelPlanDay" (id, planId, dayNumber, title, details) VALUES (?, ?, ?, ?, ?)', "old-day", "old-plan", 1, "旧版第一天", "保留历史日程");
  } finally { await db.$disconnect(); }
  return makeZip(new Map([["travel.db", await readFile(path)]]));
}

// 验证真实导出、文件校验、旧库升级以及在另一个空白实例完整恢复。
export async function verifyBackupRoundtrip({ host, session, base, photoId, startServer, stopServer }) {
  const exported = await fetch(host + "/api/admin/backup", {
    method: "POST", headers: { Origin: host, Cookie: "travel_session=" + session }, signal: AbortSignal.timeout(150_000),
  });
  assert.equal(exported.status, 200, await exported.clone().text().then(text => text.slice(0, 600)));
  assert.equal(exported.headers.get("content-type"), "application/zip");
  assert.match(exported.headers.get("cache-control"), /no-store/);
  const bytes = Buffer.from(await exported.arrayBuffer());
  const entries = await readZip(bytes);
  const manifest = JSON.parse(entries.get("backup.json"));
  assert.equal(manifest.format, "travel-planner-backup");
  assert.equal(manifest.files.length, entries.size - 1);
  assert.ok(entries.has(`uploads/${photoId}.webp`));
  for (const file of manifest.files) {
    assert.equal(createHash("sha256").update(entries.get(file.path)).digest("hex"), file.sha256);
    assert.equal(entries.get(file.path).length, file.size);
  }
  await stopServer();
  const target = join(base, "roundtrip-target");
  await mkdir(target, { recursive: true });
  const url = "file:" + join(target, "travel.db").replace(/\\/g, "/");
  migrate(url);
  const adminId = randomUUID();
  const auth = randomBytes(32).toString("base64url");
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    await db.user.create({ data: { id: adminId, username: "roundtrip_owner", displayName: "新站管理员", passwordHash: "synthetic-retained-hash", role: "ADMIN" } });
    await db.authSession.create({ data: { userId: adminId, tokenHash: createHash("sha256").update(auth).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  } finally { await db.$disconnect(); }
  const env = { ...process.env, DATABASE_URL: url, RESTORE_DATA_DIR: target, UPLOAD_DIR: join(target, "uploads"), LEGACY_MEDIA_DIR: join(target, "legacy-images"), NEXT_DIST_DIR: ".next-backup-e2e" };
  await startServer(env);

  // 只携带测试账号会话，不打印任何凭据。
  async function request(path, body, status = 200) {
    const response = await fetch(host + path, {
      method: "POST", body, headers: { Origin: host, Cookie: "travel_session=" + auth, ...(typeof body === "string" ? { "Content-Type": "application/json" } : {}) },
      signal: AbortSignal.timeout(100_000),
    });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result));
    return result;
  }

  // 通过真实 multipart 恢复入口提交备份。
  async function prepare(archive, status = 200) {
    const form = new FormData();
    form.append("backup", new Blob([archive], { type: "application/zip" }), "roundtrip.zip");
    return request("/api/admin/restore/prepare", form, status);
  }

  const corrupt = new Map(entries);
  corrupt.set(`uploads/${photoId}.webp`, Buffer.from("tampered-photo"));
  const rejected = await prepare(await makeZip(corrupt), 400);
  assert.match(rejected.error, /校验失败/);
  const oldPreview = await prepare(await oldVersionBackup(base));
  assert.ok(oldPreview.warnings.some(value => value.includes("升级")));
  const oldStaged = new PrismaClient({ datasources: { db: { url: "file:" + join(target, "restore-staging", oldPreview.id, "travel.db").replace(/\\/g, "/") } } });
  try {
    const saved = JSON.parse((await oldStaged.appSetting.findUniqueOrThrow({ where: { key: "legacy_lightweight_20261106" } })).value);
    assert.equal(saved.planDays[0].title, "旧版第一天");
    assert.equal(saved.actualBudgets[0].actualBudget, 1234);
    assert.equal(saved.expenseExtras[0].paidBy, "合成付款人");
    assert.equal((await oldStaged.expense.findUniqueOrThrow({ where: { id: "old-expense" } })).amountMinor, 10050);
  } finally { await oldStaged.$disconnect(); }
  const preview = await prepare(bytes);
  assert.equal(preview.counts.plans, 1);
  assert.equal(preview.counts.memories, 1);
  assert.equal(preview.counts.expenses, 1);
  await request("/api/admin/restore/commit", JSON.stringify({ id: preview.id }));
  await stopServer();
  const applied = spawnSync(process.execPath, [resolve("scripts/apply-pending-restore.mjs")], { cwd: process.cwd(), env, encoding: "utf8", timeout: 60_000 });
  assert.equal(applied.status, 0, applied.stderr + applied.stdout);
  const restored = new PrismaClient({ datasources: { db: { url } } });
  try {
    assert.equal((await restored.user.findUniqueOrThrow({ where: { id: adminId } })).passwordHash, "synthetic-retained-hash");
    assert.equal(await restored.user.count({ where: { isActive: true } }), 1);
    assert.equal(await restored.apiToken.count(), 0);
    assert.equal(await restored.authSession.count(), 0);
    assert.equal((await restored.destination.findUniqueOrThrow({ where: { id: "test-island" } })).isArchived, true);
    assert.equal((await restored.expense.findUniqueOrThrow({ where: { id: "backup-expense" } })).amountMinor, 12550);
    const memory = await restored.travelMemory.findUniqueOrThrow({ where: { id: "backup-memory" }, include: { photos: true } });
    assert.equal(memory.photos[0].mediaAssetId, photoId);
    await restored.authSession.create({ data: { userId: adminId, tokenHash: createHash("sha256").update(auth).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  } finally { await restored.$disconnect(); }
  assert.equal((await readFile(join(target, "uploads", `${photoId}.webp`))).length, 900 * 1024);
  await startServer(env);
  const memberPage = await fetch(host + "/admin/users", { headers: { Cookie: "travel_session=" + auth } });
  assert.match(await memberPage.text(), /创建编辑账号/, "停用的历史账号不能占用第二位成员名额");
  assert.equal((await fetch(host + `/api/media/${photoId}`)).status, 200);
  assert.equal((await fetch(host + "/destinations/test-island")).status, 404);
  console.log("BACKUP_ROUNDTRIP_PASS: exported snapshot, SHA-256, tamper rejection, legacy migration preservation, archive/plan/expense/diary/photo restore, account slots");
}
