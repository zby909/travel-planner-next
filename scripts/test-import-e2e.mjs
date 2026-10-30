import { randomBytes, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
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

  check((await api("/api/v1/visits")).items.length === 1, "Legacy visits not present");
  check((await api("/api/v1/destinations")).items.length === 1, "Legacy future destinations not present");
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
  check(beforeCommit === 1, "Prepare unexpectedly changed actual visits");

  const saved = await api("/api/v1/imports/" + draft.draftId + "/commit", { method: "POST" });
  check(saved.created.length === 1 && saved.created[0].name === "测试旅途小镇", "Visit commit missing");
  check((await db.visitedPlace.count()) === 2, "Visit not persisted");
  const createdVisit = await db.visitedPlace.findFirst({ where: { name: "测试旅途小镇" } });
  check(createdVisit, "Created visit lookup failed");
  const timelineAfterVisit = await api("/api/v1/timeline");
  check(timelineAfterVisit.items.length === 1 && timelineAfterVisit.items[0].placeIds.includes(createdVisit.id),
    "Visit import did not create its linked timeline event");

  const visitPatch = { kind: "visits-update", items: [{
    id: createdVisit.id, name: "测试旅途小镇（修订）", when: "2025-06", city: "测试市", note: "更新后的地图备注",
  }] };
  const visitPatchDraft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(visitPatch),
  });
  check(visitPatchDraft.before?.[0]?.current?.name === "测试旅途小镇", "Visit update preview did not include current values");
  check((await db.visitedPlace.findUnique({ where: { id: createdVisit.id } })).name === "测试旅途小镇",
    "Visit update preview unexpectedly changed the database");
  const visitPatchResult = await api("/api/v1/imports/" + visitPatchDraft.draftId + "/commit", { method: "POST" });
  check(visitPatchResult.updated.length === 1 && visitPatchResult.updated[0].name === "测试旅途小镇（修订）",
    "Visit update commit failed");
  const updatedVisit = await db.visitedPlace.findUnique({ where: { id: createdVisit.id } });
  check(updatedVisit?.city === "测试市" && updatedVisit.whenLabel === "2025-06" && updatedVisit.mapNote === "更新后的地图备注",
    "Visit update fields were not persisted");

  const timelineEvent = (await api("/api/v1/timeline")).items[0];
  const timelinePatch = { kind: "timeline", items: [{
    id: timelineEvent.id, year: 2025, date: "2025.06", group: "both",
    title: "测试旅行时间轴", note: "时间轴单独编辑，不依赖足迹名称",
  }] };
  const timelinePatchDraft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(timelinePatch),
  });
  check(timelinePatchDraft.before?.[0]?.current?.title === "测试旅途小镇", "Timeline preview current value missing");
  const timelinePatchResult = await api("/api/v1/imports/" + timelinePatchDraft.draftId + "/commit", { method: "POST" });
  check(timelinePatchResult.updated.length === 1, "Timeline event update failed");
  const timelineCreate = { kind: "timeline", items: [{
    year: 2024, date: "2024.08", group: "mine", title: "测试独立时间轴事件",
    note: "新增一个关联已有足迹的时间轴事件", placeIds: ["test-town"],
  }] };
  const timelineCreateDraft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(timelineCreate),
  });
  const timelineCreateResult = await api("/api/v1/imports/" + timelineCreateDraft.draftId + "/commit", { method: "POST" });
  check(timelineCreateResult.created.length === 1 && (await api("/api/v1/timeline")).items.length === 2,
    "Timeline event creation or list failed");

  const imageResponse = await fetch(host + "/api/media/" + picture.imageId);
  check(imageResponse.ok && imageResponse.headers.get("content-type") === "image/webp", "Committed photo not public");
  const stored = await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata();
  check(!stored.exif && stored.format === "webp", "Uploaded image did not get privacy-preserving metadata stripping");

  const duplicateVisit = { ...visit, items: [{ ...visit.items[0], name: "测试旅途小镇（修订）", when: "2025-06" }] };
  const duplicate = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(duplicateVisit),
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

  const destinationPatch = { kind: "destinations-update", items: [{
    id: created.id, title: "测试未来小岛（修订）", reason: "补充更完整的测试攻略",
    budget: { flight: 2600 }, minBudget: 4600, maxBudget: 6200,
    flightPricing: { route: "广州往返测试小岛", normalMin: 1800, normalMax: 2200,
      holidayMin: 2800, holidayMax: 3600, normalSample: "平日样本：测试日期", holidaySample: "节假日样本：测试日期" },
    guideDays: [{ title: "第一天：抵达", detail: "入住并休息" }, { title: "第二天：环岛", detail: "游览测试海湾" }],
  }] };
  const destinationPatchDraft = await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(destinationPatch),
  });
  check(destinationPatchDraft.before?.[0]?.current?.title === "测试未来小岛", "Destination update preview did not include current values");
  check((await db.destination.findUnique({ where: { id: created.id } })).title === "测试未来小岛",
    "Destination update preview unexpectedly changed the database");
  const destinationPatchResult = await api("/api/v1/imports/" + destinationPatchDraft.draftId + "/commit", { method: "POST" });
  check(destinationPatchResult.updated.length === 1, "Destination update commit failed");
  const revisedDestination = await db.destination.findUnique({ where: { id: created.id }, include: { guide: { include: { days: true } }, flightPricing: true } });
  check(revisedDestination?.title === "测试未来小岛（修订）" && revisedDestination.pickBudget === 5100
    && revisedDestination.guide?.days.length === 2 && revisedDestination.flightPricing?.normalMin === 1800,
    "Destination title, budget, flight pricing or guide update was not persisted");

  const page = await fetch(host + "/destinations/" + created.id);
  check(page.ok && (await page.text()).includes("测试未来小岛"), "Future destination public page is broken");
  const visitsPage = await fetch(host + "/visited");
  check(visitsPage.ok && (await visitsPage.text()).includes("测试旅途小镇"), "Imported visit not shown publicly");

  // CLI should work without injecting secrets into command arguments.
  await mkdir(configDir, { recursive: true });
  const appData = join(configDir, "app");
  await mkdir(join(appData, "travelctl"), { recursive: true });
  await writeFile(join(appData, "travelctl", "config.json"), JSON.stringify({ server: host, token }), { mode: 0o600 });
  const cliEnv = { ...process.env, APPDATA: appData };
  const checkCli = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "destinations", "list"], {
    encoding: "utf8", env: cliEnv,
  });
  check(checkCli.status === 0 && checkCli.stdout.includes("测试未来小岛（修订）"), "CLI read failed");
  if (process.platform === "win32") {
    const savedConfig = JSON.parse(await readFile(join(appData, "travelctl", "config.json"), "utf8"));
    check(savedConfig.credential?.provider === "windows-dpapi" && !savedConfig.token
      && !JSON.stringify(savedConfig).includes(token), "Legacy plaintext CLI config was not migrated to DPAPI");
  }
  const cliTimeline = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "timeline", "list"], {
    encoding: "utf8", env: cliEnv,
  });
  check(cliTimeline.status === 0 && cliTimeline.stdout.includes("测试旅行时间轴"), "CLI timeline list failed");

  const cliVisitPatchFile = join(configDir, "visit-update.json");
  await writeFile(cliVisitPatchFile, JSON.stringify({ items: [{ id: createdVisit.id, note: "CLI 再次补充备注" }] }));
  const cliVisitPatch = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "visits", "update", "prepare", cliVisitPatchFile], {
    encoding: "utf8", env: cliEnv,
  });
  check(cliVisitPatch.status === 0, "CLI visit update prepare failed: " + cliVisitPatch.stderr.slice(-500));
  const cliVisitDraft = JSON.parse(cliVisitPatch.stdout).draftId;
  const cliVisitCommit = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "import", "commit", cliVisitDraft, "--confirm"], {
    encoding: "utf8", env: cliEnv,
  });
  check(cliVisitCommit.status === 0 && (await db.visitedPlace.findUnique({ where: { id: createdVisit.id } })).mapNote === "CLI 再次补充备注",
    "CLI visit update commit failed");

  const cliDestinationPatchFile = join(configDir, "destination-update.json");
  await writeFile(cliDestinationPatchFile, JSON.stringify({ items: [{ id: created.id, reason: "由 Node CLI 更新的旅行说明" }] }));
  const cliDestinationPatch = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "destinations", "update", "prepare", cliDestinationPatchFile], {
    encoding: "utf8", env: cliEnv,
  });
  check(cliDestinationPatch.status === 0, "CLI destination update prepare failed: " + cliDestinationPatch.stderr.slice(-500));
  const cliDestinationDraft = JSON.parse(cliDestinationPatch.stdout).draftId;
  const cliDestinationCommit = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "import", "commit", cliDestinationDraft, "--confirm"], {
    encoding: "utf8", env: cliEnv,
  });
  check(cliDestinationCommit.status === 0
    && (await db.destination.findUnique({ where: { id: created.id } })).reason === "由 Node CLI 更新的旅行说明",
    "CLI destination update commit failed");

  const moreFutureFile = join(configDir, "more-future.json");
  await writeFile(moreFutureFile, JSON.stringify({ items: [{
    title: "CLI 新旅程", subtitle: "测试地区", months: "8月",
    route: ["起点", "终点"], spots: [],
  }] }));
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
  const logout = spawnSync(process.execPath, ["cli/bin/travelctl.mjs", "auth", "logout"], { encoding: "utf8", env: cliEnv });
  check(logout.status === 0, "CLI auth logout failed");

  await db.apiToken.updateMany({ where: { userId: admin.id }, data: { revokedAt: new Date() } });
  const disabled = await fetch(host + "/api/v1/visits", { headers: requestHeaders });
  check(disabled.status === 401, "Revoked token still works");
  console.log("IMPORT_E2E_PASS: auth, DPAPI migration, media staging, visit/destination create+update, timeline list/create/update, budget/flight/guide updates, CLI logout, revocation");
}
try { await run(); }
catch (e) { console.error("IMPORT_E2E_FAIL:", e.message); process.exitCode = 1; }
finally {
  if (server) { server.kill("SIGTERM"); await new Promise(resolve => { if (server.exitCode !== null) return resolve(); server.once("exit", resolve); setTimeout(resolve, 3000).unref(); }); }
  await db.$disconnect();
  await rm(configDir, { recursive: true, force: true }).catch(() => {});
}
