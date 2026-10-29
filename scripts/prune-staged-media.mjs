import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const dir = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
const now = new Date();

try {
  const activeDrafts = await prisma.importDraft.findMany({
    where: { status: "PREPARED", expiresAt: { gt: now } },
    select: { payloadJson: true },
  });
  const protectedIds = new Set();
  for (const draft of activeDrafts) {
    try {
      const data = JSON.parse(draft.payloadJson);
      for (const item of data.items || []) if (typeof item.imageId === "string") protectedIds.add(item.imageId);
    } catch {}
  }
  const expiration = new Date(now.getTime() - 48 * 3600_000);
  const staged = await prisma.mediaAsset.findMany({
    where: { status: "STAGED", createdAt: { lt: expiration } },
  });
  let deleted = 0;
  for (const file of staged) {
    if (protectedIds.has(file.id)) continue;
    // This script is intentionally run before the web server starts to avoid
    // races with in-progress import confirmation.
    try {
      await unlink(join(dir, file.fileName));
    } catch (error) {
      if (error?.code !== "ENOENT") { console.warn("Unable to remove staged image", file.id); continue; }
    }
    await prisma.mediaAsset.deleteMany({ where: { id: file.id, status: "STAGED" } });
    deleted++;
  }
  console.log(`Staged media cleanup: ${deleted} old unreferenced images removed`);
} catch (error) {
  console.warn("Staged media cleanup failed:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
