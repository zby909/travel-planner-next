import { readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dir = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
const now = new Date();
const expiration = new Date(now.getTime() - 48 * 3600_000);

try {
  const activeDrafts = await prisma.importDraft.findMany({ where: { status: "PREPARED", expiresAt: { gt: now } }, select: { payloadJson: true } });
  const protectedIds = new Set();
  for (const draft of activeDrafts) {
    try {
      const data = JSON.parse(draft.payloadJson);
      for (const item of data.items || []) if (typeof item.imageId === "string") protectedIds.add(item.imageId);
    } catch {}
  }
  const stale = await prisma.mediaAsset.findMany({ where: { createdAt: { lt: expiration } } });
  let deleted = 0;
  // 启动前运行，兼顾旧版本遗留的 PUBLIC 孤立资源；归档和待确认草稿都不能误删。
  for (const file of stale) {
    if (protectedIds.has(file.id) || !/^[a-f0-9-]{36}$/i.test(file.id) || file.fileName !== `${file.id}.webp`) continue;
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
    deleted++;
  }
  // 回收写入中断或文件删除失败留下的孤立 WebP，至少保留 48 小时避免影响在途上传。
  const entries = await readdir(dir).catch(error => { if (error.code === "ENOENT") return []; throw error; });
  for (const name of entries) {
    if (!/^[a-f0-9-]{36}\.webp$/i.test(name)) continue;
    const path = join(dir, name);
    const info = await stat(path);
    if (info.mtime > expiration || !info.isFile()) continue;
    if (!await prisma.mediaAsset.findUnique({ where: { id: name.slice(0, -5) } })) await unlink(path);
  }
  await prisma.importDraft.deleteMany({ where: { expiresAt: { lt: now } } });
  await prisma.authSession.deleteMany({ where: { expiresAt: { lt: now } } });
  console.log(`Media cleanup: ${deleted} old unreferenced records removed`);
} catch (error) {
  console.warn("Media cleanup failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
