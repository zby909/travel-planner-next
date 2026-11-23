import { lstat, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dir = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
const cacheDir = join(dir, ".cache");
const PREVIEW_WIDTHS = ["320", "640", "960"];
const now = new Date();
const expiration = new Date(now.getTime() - 48 * 3600_000);

// 同时清理指定媒体 ID 对应的派生缩略图缓存文件。
async function removeCachedVariants(id) {
  await Promise.all(PREVIEW_WIDTHS.map(width => unlink(join(cacheDir, `${id}-w${width}.webp`)).catch(() => {})));
}

try {
  const activeDrafts = await prisma.importDraft.findMany({ where: { status: "PREPARED", expiresAt: { gt: now } }, select: { payloadJson: true } });
  const protectedIds = new Set();
  for (const draft of activeDrafts) {
    try {
      const data = JSON.parse(draft.payloadJson);
      for (const item of data.items || []) if (typeof item.imageId === "string") protectedIds.add(item.imageId);
    } catch {}
  }
  const [places, destinations, photos, stale] = await Promise.all([
    prisma.visitedPlace.findMany({ select: { image: true } }),
    prisma.destination.findMany({ select: { imagePath: true } }),
    prisma.travelPhoto.findMany({ select: { filePath: true, mediaAssetId: true } }),
    prisma.mediaAsset.findMany({ where: { createdAt: { lt: expiration } }, select: { id: true, fileName: true } }),
  ]);
  // 启动时批量筛出真正的候选项，只有待删除的媒体才需要逐项加锁复核。
  const referenced = new Set(photos.map(photo => photo.mediaAssetId).filter(Boolean));
  for (const path of [...places.map(place => place.image), ...destinations.map(item => item.imagePath), ...photos.map(photo => photo.filePath)]) {
    const id = path?.match(/^\/?api\/media\/([a-f0-9-]{36})$/i)?.[1];
    if (id) referenced.add(id);
  }
  let deleted = 0;
  // 启动前运行，兼顾旧版本遗留的 PUBLIC 孤立资源；归档和待确认草稿都不能误删。
  for (const file of stale) {
    if (referenced.has(file.id) || protectedIds.has(file.id) || !/^[a-f0-9-]{36}$/i.test(file.id) || file.fileName !== `${file.id}.webp`) continue;
    const paths = [`api/media/${file.id}`, `/api/media/${file.id}`];
    const released = await prisma.$transaction(async tx => {
      await tx.$executeRaw`UPDATE "MediaAsset" SET "status" = "status" WHERE "id" = ${file.id}`;
      const drafts = await tx.importDraft.findMany({ where: { status: "PREPARED", expiresAt: { gt: new Date() } }, select: { payloadJson: true } });
      if (drafts.some(draft => { try { return JSON.parse(draft.payloadJson).items?.some(item => item.imageId === file.id); } catch { return false; } })) return false;
      const references = await Promise.all([
        tx.destination.count({ where: { imagePath: { in: paths } } }),
        tx.visitedPlace.count({ where: { image: { in: paths } } }),
        tx.travelPhoto.count({ where: { OR: [{ mediaAssetId: file.id }, { filePath: { in: paths } }] } }),
      ]);
      if (references.some(Boolean)) return false;
      await tx.mediaAsset.deleteMany({ where: { id: file.id } });
      return true;
    });
    if (!released) continue;
    try { await unlink(join(dir, file.fileName)); }
    catch (error) { if (error?.code !== "ENOENT") console.warn("Media file cleanup deferred", file.id); }
    await removeCachedVariants(file.id);
    deleted++;
  }
  // 回收写入中断或文件删除失败留下的孤立 WebP，至少保留 48 小时避免影响在途上传。
  const entries = await readdir(dir).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  const existingOriginals = new Set(entries.filter(name => /^[a-f0-9-]{36}\.webp$/i.test(name)).map(name => name.slice(0, -5)));
  for (const name of entries) {
    if (!/^[a-f0-9-]{36}\.webp$/i.test(name) || referenced.has(name.slice(0, -5))) continue;
    const id = name.slice(0, -5);
    const path = join(dir, name);
    const info = await lstat(path).catch(error => { if (error.code === "ENOENT") return null; throw error; });
    if (!info || info.mtime > expiration || !info.isFile() || info.isSymbolicLink()) continue;
    if (!await prisma.mediaAsset.findUnique({ where: { id } })) {
      await unlink(path).catch(error => { if (error?.code !== "ENOENT") throw error; });
      await removeCachedVariants(id);
      existingOriginals.delete(id);
    }
  }
  // 清理失去原图或格式异常的孤立缩略图缓存。
  const cachedEntries = await readdir(cacheDir).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  for (const name of cachedEntries) {
    const match = /^([a-f0-9-]{36})-w(?:320|640|960)\.webp$/i.exec(name);
    if (!match || !existingOriginals.has(match[1])) {
      await unlink(join(cacheDir, name)).catch(() => {});
    }
  }
  await prisma.importDraft.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.loginThrottle.deleteMany({ where: { updatedAt: { lt: expiration } } });
  console.log(`Media cleanup: ${deleted} old unreferenced records removed`);
} catch (error) {
  console.warn("Media cleanup failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
