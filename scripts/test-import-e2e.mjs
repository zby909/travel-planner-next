import { randomBytes, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const host = "http://127.0.0.1:3016";
const db = new PrismaClient();
let server;
const token = "trv_" + randomBytes(32).toString("base64url");
const configDir = join(process.cwd(), "data", "import-e2e-cli");
const requestHeaders = { Authorization: "Bearer " + token };

function check(ok, msg) { if (!ok) throw new Error(msg); }
async function api(path, options = {}, requiredStatus = 200) {
  const result = await fetch(host + path, {
    ...options,
    headers: { ...requestHeaders, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000),
  });
  const body = await result.json().catch(() => ({}));
  check(result.status === requiredStatus, `${path} expected ${requiredStatus}, got ${result.status}: ${JSON.stringify(body).slice(0, 400)}`);
  return body;
}
async function waitForHealth() {
  for (let i = 0; i < 90; i++) {
    if (server?.exitCode !== null) throw new Error("Next.js server exited unexpectedly");
    try { if ((await fetch(host + "/api/health", { signal: AbortSignal.timeout(1000) })).ok) return; }
    catch {}
    await new Promise(r => setTimeout(r, 650));
  }
  throw new Error("Next.js server did not start");
}
async function run() {
  check(process.env.DATABASE_URL === "file:../data/import-e2e.db", "Refusing to use a non-test DB");
  const admin = await db.user.create({
    data: { username: "import_e2e", displayName: "临时导入管理员", passwordHash: "test-not-for-login", role: "ADMIN" },
  });
  await db.apiToken.create({
    data: { userId: admin.id, title: "Integration test", tokenHash: createHash("sha256").update(token).digest("hex"),
      scopesJson: JSON.stringify(["visits:read", "visits:write", "destinations:read", "destinations:write", "media:write"]),
      expiresAt: new Date(Date.now() + 3600_000) },
  });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3016", "--hostname", "127.0.0.1"], {
    cwd: process.cwd(), env: { ...process.env, NODE_ENV: "development" }, stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", () => {});
  let errors = "";
  server.stderr.on("data", chunk => { errors = (errors + String(chunk)).slice(-2000); });
  await waitForHealth();

  check((await api("/api/v1/visits")).items.length === 31, "Legacy visits not present");
  check((await api("/api/v1/destinations")).items.length === 14, "Legacy future destinations not present");
  const anon = await fetch(host + "/api/v1/visits");
  check(anon.status === 401, "Anonymous read was allowed");

  const photo = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#b5cca7" } }).jpeg().toBuffer();
  const upload = new FormData();
  upload.append("image", new Blob([photo], { type: "image/jpeg" }), "travel.jpg");
  const picture = await api("/api/v1/media", { method: "POST", body: upload }, 201);
  check(picture.imageId && picture.status === "STAGED", "Image upload did not create staged asset");
  check((await fetch(host + "/api/media/" + picture.imageId)).status === 404, "Staged photo is publicly readable");

  const invalid = new FormData();
  invalid.append("image", new Blob([Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")], { type: "image/svg+xml" }), "bad.svg");
  await api("/api/v1/media", { method: "POST", body: invalid }, 415);

  const visit = { kind: "visits", items: [{
    name: "测试旅途小镇", region: "测试地区 · 示例", when: "2025-05", group: "mine", country: "测试国家",
    latitude: 34.5, longitude: 106.7, note: "通过 CLI 的测试导入", imageId: picture.imageId,
  }] };
  const draft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visit),
  });
  check(draft.draftId && draft.items.length === 1, "Visit draft missing");
  const beforeCommit = await db.visitedPlace.count();
  check(beforeCommit === 31, "Prepare unexpectedly changed actual visits");

  const saved = await api("/api/v1/imports/" + draft.draftId + "/commit", { method: "POST" });
  check(saved.created.length === 1 && saved.created[0].name === "测试旅途小镇", "Visit commit missing");
  check((await db.visitedPlace.count()) === 32, "Visit not persisted");
  const imageResponse = await fetch(host + "/api/media/" + picture.imageId);
  check(imageResponse.ok && imageResponse.headers.get("content-type") === "image/webp", "Committed photo not public");
  const stored = await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata();
  check(!stored.exif && stored.format === "webp", "Uploaded image did not get privacy-preserving metadata stripping");

  const duplicate = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visit),
  });
  check(duplicate.warnings.some(s => s.includes("已存在")), "No warning for existing visit");
  const skipped = await api("/api/v1/imports/" + duplicate.draftId + "/commit", { method: "POST" });
  check(skipped.created.length === 0 && skipped.skipped.length === 1, "Duplicate visit was not skipped");

  const future = { kind: "destinations", items: [{
    title: "测试未来小岛", subtitle: "虚构目的地", months: "4月", days: "4天", vibe: "轻松出行",
    reason: "测试目的地完整导入", spots: ["测试海湾"], route: ["小岛", "海湾"],
    guideDays: [{ title: "抵达", detail: "入住酒店" }],
    budget: { flight: 2500, hotel: 1200, group: 0, food: 500, tickets: 400, transport: 300, other: 100 },
    minBudget: 4500, maxBudget: 6000, imageId: picture.imageId,
  }] };
  const futureDraft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(future),
  });
  const futureResult = await api("/api/v1/imports/" + futureDraft.draftId + "/commit", { method: "POST" });
  check(futureResult.created.length === 1, "Destination not imported");
  const created = await db.destination.findUnique({ where: { id: futureResult.created[0].id }, include: { guide: { include: { days: true } } } });
  check(created?.pickBudget === 5000 && created.guide?.days.length === 1 && created.imagePath?.includes(picture.imageId), "Destination budget, guide or cover incorrect");
  const page = await fetch(host + "/destinations/" + created.id);
  check(page.ok && (await page.text()).includes("测试未来小岛"), "Future destination public page is broken");
  const visitsPage = await fetch(host + "/visited");
  check(visitsPage.ok && (await visitsPage.text()).includes("测试旅途小镇"), "Imported visit not shown publicly");

  // CLI should work without injecting secrets into command arguments.
  await mkdir(configDir, { recursive: true });
  const appData = join(configDir, "app");
  await mkdir(join(appData, "travelctl"), { recursive: true });
  await writeFile(join(appData, "travelctl", "config.json"), JSON.stringify({ server: host, token }), { mode: 0o600 });
  const checkCli = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "destinations", "list"], {
    encoding: "utf8", env: { ...process.env, APPDATA: appData },
  });
  check(checkCli.status === 0 && checkCli.stdout.includes("测试未来小岛"), "CLI read failed");
  const moreFutureFile = join(configDir, "more-future.json");
  await writeFile(moreFutureFile, JSON.stringify({ items: [{
    title: "CLI 新旅程", subtitle: "测试地区", months: "8月",
    route: ["起点", "终点"], spots: [],
  }] }));
  const cliEnv = { ...process.env, APPDATA: appData };
  const prepareCli = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "destinations", "prepare", moreFutureFile], {
    encoding: "utf8", env: cliEnv,
  });
  check(prepareCli.status === 0, "CLI future prepare failed: " + prepareCli.stderr.slice(-500));
  const cliDraft = JSON.parse(prepareCli.stdout);
  check(cliDraft.draftId, "CLI draft ID missing");
  const commitCli = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "import", "commit", cliDraft.draftId, "--confirm"], {
    encoding: "utf8", env: cliEnv,
  });
  check(commitCli.status === 0, "CLI future commit failed: " + commitCli.stderr.slice(-500));
  check((await db.destination.findFirst({ where: { title: "CLI 新旅程" } })) !== null, "CLI did not save future destination");

  await db.apiToken.updateMany({ where: { userId: admin.id }, data: { revokedAt: new Date() } });
  const disabled = await fetch(host + "/api/v1/visits", { headers: requestHeaders });
  check(disabled.status === 401, "Revoked token still works");
  console.log("IMPORT_E2E_PASS: token, private staging, image metadata removal, visit preview/commit, duplicate handling, future budget/guide/cover, CLI, revocation");
}
try { await run(); }
catch (e) { console.error("IMPORT_E2E_FAIL:", e.message); process.exitCode = 1; }
finally {
  if (server) { server.kill("SIGTERM"); await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once("exit", resolve); setTimeout(resolve, 3000).unref(); }); }
  await db.$disconnect();
  await rm(configDir, { recursive: true, force: true }).catch(() => {});
}
