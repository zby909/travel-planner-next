import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { installRestoreMedia, restoreMediaTempPath, rollbackRestoreMedia } from "./restore-media.mjs";

// 模拟媒体复制中断、重放和冲突，保证旧文件不会被覆盖或误删。
export async function verifyRestoreMedia(base) {
  const oldUpload = process.env.UPLOAD_DIR;
  const oldLegacy = process.env.LEGACY_MEDIA_DIR;
  const folder = join(base, "media-crash", "task");
  const data = join(base, "media-crash", "data");
  const uploads = join(base, "media-crash", "custom-uploads");
  const legacy = join(base, "media-crash", "custom-legacy");
  process.env.UPLOAD_DIR = uploads;
  process.env.LEGACY_MEDIA_DIR = legacy;
  try {
    await mkdir(join(folder, "uploads"), { recursive: true });
    await mkdir(join(folder, "legacy-images", "images"), { recursive: true });
    await mkdir(uploads, { recursive: true });
    await writeFile(join(folder, "uploads", "a.webp"), "photo-a");
    await writeFile(join(folder, "uploads", "b.webp"), "photo-b");
    await writeFile(join(folder, "legacy-images", "images", "old.jpg"), "legacy-photo");
    await writeFile(join(uploads, "untouched.webp"), "existing-file");
    await installRestoreMedia(folder, data);
    // 有日志且一部分文件已存在，等价于上一次复制尚未全部完成。
    await rm(join(uploads, "b.webp"));
    const partial = restoreMediaTempPath(folder, join(uploads, "b.webp"));
    const afterLink = restoreMediaTempPath(folder, join(uploads, "a.webp"));
    await writeFile(partial, "pho");
    await writeFile(afterLink, "photo-a");
    assert.equal(existsSync(join(uploads, "b.webp")), false, "半文件不能暴露为最终目标");
    await installRestoreMedia(folder, data);
    assert.equal(existsSync(partial), false, "中断留下的半个临时文件应被安全重做");
    assert.equal(existsSync(afterLink), false, "原子发布后中断留下的临时文件应被清理");
    assert.equal((await readFile(join(uploads, "b.webp"))).toString(), "photo-b");
    assert.equal((await readFile(join(legacy, "images", "old.jpg"))).toString(), "legacy-photo");
    await writeFile(partial, "pho");
    await rollbackRestoreMedia(folder, data);
    assert.equal(existsSync(partial), false, "回退必须回收本任务残缺临时文件");
    assert.equal(existsSync(join(uploads, "a.webp")), false);
    assert.equal(existsSync(join(uploads, "b.webp")), false);
    assert.equal((await readFile(join(uploads, "untouched.webp"))).toString(), "existing-file");
    assert.equal(existsSync(join(folder, "media-install.json")), false);
    await writeFile(join(uploads, "b.webp"), "do-not-overwrite");
    await assert.rejects(installRestoreMedia(folder, data), /已有同名/);
    assert.equal(existsSync(join(uploads, "a.webp")), false, "冲突应在复制第一个文件前拒绝");
    assert.equal((await readFile(join(uploads, "b.webp"))).toString(), "do-not-overwrite");
    await rm(join(uploads, "b.webp"));
    await installRestoreMedia(folder, data);
    await writeFile(join(uploads, "b.webp"), "changed-after-publication");
    await assert.rejects(rollbackRestoreMedia(folder, data), /保留媒体所有权清单/);
    assert.equal(existsSync(join(folder, "media-install.json")), true, "内容异常时不能丢弃所有权清单");
    assert.equal((await readFile(join(uploads, "b.webp"))).toString(), "changed-after-publication");
    await writeFile(join(uploads, "b.webp"), "photo-b");
    await rollbackRestoreMedia(folder, data);
    assert.equal(existsSync(join(folder, "media-install.json")), false);
    console.log("RESTORE_MEDIA_RECOVERY_PASS: custom roots, partial temp replay, atomic publication, ownership-preserving rollback and conflict protection");
  } finally {
    if (oldUpload === undefined) delete process.env.UPLOAD_DIR; else process.env.UPLOAD_DIR = oldUpload;
    if (oldLegacy === undefined) delete process.env.LEGACY_MEDIA_DIR; else process.env.LEGACY_MEDIA_DIR = oldLegacy;
  }
}
