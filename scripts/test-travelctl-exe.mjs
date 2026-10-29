import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const exe = resolve("dist/travelctl.exe");
if (process.platform !== "win32" || !existsSync(exe)) {
  console.error("EXE_SMOKE_FAIL: Windows travelctl.exe is required");
  process.exit(1);
}

const token = "trv_" + "A".repeat(43);
const uploadedImageId = "01234567-89ab-4cde-8f01-23456789abcd";
const drafts = new Map();
const actions = [];
let revoked = false;
let nextDraft = 1;
const temp = await mkdtemp(join(tmpdir(), "travelctl-exe-test-"));
let server;

function assert(ok, message) {
  if (!ok) throw new Error(message);
}
async function invoke(args) {
  return new Promise((res, rej) => {
    const child = spawn(exe, args, {
      env: { ...process.env, APPDATA: temp },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", b => stdout += b.toString());
    child.stderr.on("data", b => stderr += b.toString());
    child.on("error", rej);
    child.on("close", (code) => res({ code, stdout, stderr }));
  });
}
async function handle(req, res) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  res.setHeader("Content-Type", "application/json");
  const send = (status, json) => { res.statusCode = status; res.end(JSON.stringify(json)); };
  if (req.headers.authorization !== `Bearer ${token}` || revoked) return send(401, { error: "unauthorized" });
  const path = req.url || "";
  if (path === "/api/v1/me") return send(200, { user: { username: "exe_test" } });
  if (path === "/api/v1/visits" && req.method === "GET") return send(200, { items: [] });
  if (path === "/api/v1/destinations" && req.method === "GET") return send(200, { items: [] });
  if (path === "/api/v1/media" && req.method === "POST") {
    assert(req.headers["content-type"]?.startsWith("multipart/form-data;"), "Image did not use multipart/form-data");
    assert(body.includes(Buffer.from("photo.jpg")), "Uploaded photo filename was missing");
    actions.push("media-upload");
    return send(201, { imageId: uploadedImageId, status: "STAGED", bytes: body.length });
  }
  if (path === "/api/v1/imports/prepare" && req.method === "POST") {
    const parsed = JSON.parse(body.toString("utf8"));
    assert(["visits", "destinations"].includes(parsed.kind) && parsed.items?.length === 1, "Import JSON invalid");
    const draftId = "draft" + String(nextDraft++).padStart(16, "0");
    drafts.set(draftId, parsed);
    actions.push("prepare-" + parsed.kind);
    return send(200, { draftId, kind: parsed.kind, items: parsed.items, warnings: [] });
  }
  const commit = path.match(/^\/api\/v1\/imports\/([^/]+)\/commit$/);
  if (commit && req.method === "POST") {
    const draft = drafts.get(commit[1]);
    assert(draft, "Commit draft not previously prepared");
    actions.push("commit-" + draft.kind);
    drafts.delete(commit[1]);
    return send(200, { kind: draft.kind, created: [{ id: "test-id", name: "test" }], skipped: [] });
  }
  const cancel = path.match(/^\/api\/v1\/imports\/([^/]+)\/cancel$/);
  if (cancel && req.method === "POST") { actions.push("cancel"); return send(200, { canceled: true }); }
  return send(404, { error: "not found" });
}
try {
  server = createServer((req, res) => {
    handle(req, res).catch(err => {
      console.error("MOCK_SERVER_FAIL", err);
      res.writeHead(500).end(JSON.stringify({ error: err.message }));
    });
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  await mkdir(join(temp, "travelctl"), { recursive: true });
  await writeFile(join(temp, "travelctl", "config.json"), JSON.stringify({ server: origin, token }));

  let call = await invoke(["auth", "status"]);
  assert(call.code === 0 && call.stdout.includes(origin), "EXE auth status failed: " + call.stderr);

  call = await invoke(["visits", "list"]);
  assert(call.code === 0 && call.stdout.includes('"items": []'), "EXE visits list failed");

  call = await invoke(["destinations", "list"]);
  assert(call.code === 0 && call.stdout.includes('"items": []'), "EXE destinations list failed");

  const photo = join(temp, "photo.jpg");
  await writeFile(photo, Buffer.alloc(512, 0x42));
  call = await invoke(["media", "upload", photo]);
  assert(call.code === 0 && JSON.parse(call.stdout).imageId === uploadedImageId, "EXE photo upload failed: " + call.stderr);

  const visitFile = join(temp, "visits.json");
  await writeFile(visitFile, JSON.stringify({ items: [{ name: "东京", region: "日本", group: "mine", when: "2025-05", imageId: uploadedImageId }] }));
  call = await invoke(["visits", "prepare", visitFile]);
  assert(call.code === 0, "EXE visit prepare failed: " + call.stderr);
  const visitDraft = JSON.parse(call.stdout).draftId;
  call = await invoke(["import", "commit", visitDraft]);
  assert(call.code !== 0 && /--confirm/.test(call.stderr), "EXE commit did not require confirmation");
  call = await invoke(["import", "commit", visitDraft, "--confirm"]);
  assert(call.code === 0 && JSON.parse(call.stdout).created.length === 1, "EXE visit commit failed: " + call.stderr);

  const futureFile = join(temp, "future.json");
  await writeFile(futureFile, JSON.stringify({ items: [{ title: "京都", subtitle: "日本关西", imageId: uploadedImageId }] }));
  call = await invoke(["destinations", "prepare", futureFile]);
  assert(call.code === 0, "EXE destination prepare failed: " + call.stderr);
  const futureDraft = JSON.parse(call.stdout).draftId;
  call = await invoke(["import", "commit", futureDraft, "--confirm"]);
  assert(call.code === 0 && JSON.parse(call.stdout).created.length === 1, "EXE destination commit failed: " + call.stderr);

  revoked = true;
  call = await invoke(["auth", "status"]);
  assert(call.code !== 0 && call.stderr.includes("401"), "Revoked Token not rejected");

  assert(actions.join(",") === "media-upload,prepare-visits,commit-visits,prepare-destinations,commit-destinations", "Unexpected server calls: " + actions);
  console.log("EXE_SMOKE_PASS: real Windows binary, auth, visit/destination import, photo upload, confirmation, revoked token");
} catch (error) {
  console.error("EXE_SMOKE_FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  await rm(temp, { recursive: true, force: true });
}
