import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

// 经公开 API 验证 CLI 共用的归档、草稿取消和媒体生命周期规则。
export async function verifyImportClosure({ api, db, host, visitId, destinationId, imageId, photo, ownerId }) {
  // 归档与恢复仍必须先预览，再确认提交。
  async function change(kind, items) {
    const draft = await api("/api/v1/imports/prepare", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, items }) });
    return api(`/api/v1/imports/${draft.draftId}/commit`, { method: "POST" });
  }
  await change("visits-update", [{ id: visitId, isArchived: true }]);
  await change("destinations-update", [{ id: destinationId, isArchived: true }]);
  assert.equal((await fetch(`${host}/destinations/${destinationId}`)).status, 404);
  assert.equal((await fetch(`${host}/api/media/${imageId}`)).status, 404);
  assert.ok((await api("/api/v1/visits")).items.find(item => item.id === visitId).isArchived);
  assert.ok((await api("/api/v1/destinations")).items.find(item => item.id === destinationId).isArchived);
  await change("visits-update", [{ id: visitId, isArchived: false }]);
  await change("destinations-update", [{ id: destinationId, isArchived: false }]);
  assert.equal((await fetch(`${host}/api/media/${imageId}`)).status, 200);

  const form = new FormData();
  form.append("image", new Blob([photo], { type: "image/jpeg" }), "cancel-cover.jpg");
  const staged = await api("/api/v1/media", { method: "POST", body: form }, 201);
  const drafts = [];
  for (let i = 0; i < 2; i++) drafts.push(await api("/api/v1/imports/prepare", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "destinations-update", items: [{ id: destinationId, imageId: staged.imageId }] }),
  }));
  await api(`/api/v1/imports/${drafts[0].draftId}/cancel`, { method: "POST" });
  assert.ok(await db.mediaAsset.findUnique({ where: { id: staged.imageId } }), "另一草稿仍使用的图片被误删");
  await api(`/api/v1/imports/${drafts[1].draftId}/cancel`, { method: "POST" });
  assert.equal(await db.mediaAsset.findUnique({ where: { id: staged.imageId } }), null);
  assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${staged.imageId}.webp`)), false);

  await change("destinations-update", [{ id: destinationId, imageId: null }]);
  assert.ok(await db.mediaAsset.findUnique({ where: { id: imageId } }), "足迹仍在使用的图片被误删");
  await change("visits-update", [{ id: visitId, imageId: null }]);
  assert.equal(await db.mediaAsset.findUnique({ where: { id: imageId } }), null);
  assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${imageId}.webp`)), false);

  const orphanId = randomUUID();
  const old = new Date(Date.now() - 72 * 3600_000);
  await writeFile(join(process.env.UPLOAD_DIR, `${orphanId}.webp`), photo);
  await db.mediaAsset.create({ data: { id: orphanId, ownerId, fileName: `${orphanId}.webp`, mimeType: "image/webp", byteSize: photo.length, status: "PUBLIC", createdAt: old } });
  const protectedId = randomUUID();
  await writeFile(join(process.env.UPLOAD_DIR, `${protectedId}.webp`), photo);
  await db.mediaAsset.create({ data: { id: protectedId, ownerId, fileName: `${protectedId}.webp`, mimeType: "image/webp", byteSize: photo.length, status: "PUBLIC", createdAt: old } });
  await db.visitedPlace.update({ where: { id: visitId }, data: { isArchived: true, image: `api/media/${protectedId}` } });
  const cleanup = spawnSync(process.execPath, ["scripts/prune-staged-media.mjs"], { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 60_000 });
  assert.equal(cleanup.status, 0, cleanup.stderr);
  assert.equal(await db.mediaAsset.findUnique({ where: { id: orphanId } }), null);
  assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${orphanId}.webp`)), false);
  assert.ok(await db.mediaAsset.findUnique({ where: { id: protectedId } }));
  assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${protectedId}.webp`)), true);
  console.log("IMPORT_CLOSURE_PASS: archive preview/restore, shared media clearing, draft cancellation, legacy orphan GC and archived-media protection");
}
