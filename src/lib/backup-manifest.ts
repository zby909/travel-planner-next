import "server-only";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { MAX_BACKUP_ENTRIES, validBackupImagePath } from "@/lib/backup-format";

const manifestSchema = z.object({
  format: z.literal("travel-planner-backup"), version: z.literal(1), createdAt: z.iso.datetime(),
  files: z.array(z.object({
    path: z.string().max(600).refine(path => path === "travel.db"
      || (path.startsWith("uploads/") && validBackupImagePath(path))
      || (path.startsWith("legacy-images/images/") && validBackupImagePath(path.slice("legacy-images/".length)))),
    size: z.number().int().nonnegative(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict()).min(1).max(MAX_BACKUP_ENTRIES - 1),
}).strict();

// 新备份必须逐文件核对清单；没有清单的历史兼容包仍走原有完整性检查。
export async function validateBackupManifest(folder: string, extracted: string[]): Promise<void> {
  const raw = await readFile(join(folder, "backup.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (raw === null) return;
  const parsed = manifestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw Error("备份清单格式或版本不兼容");
  const expected = new Set(parsed.data.files.map(file => file.path));
  const actual = extracted.filter(path => path !== "backup.json");
  if (expected.size !== parsed.data.files.length || actual.length !== expected.size || actual.some(path => !expected.has(path))) {
    throw Error("备份文件与清单不一致");
  }
  for (const file of parsed.data.files) {
    const bytes = await readFile(join(folder, file.path));
    if (bytes.length !== file.size || createHash("sha256").update(bytes).digest("hex") !== file.sha256) {
      throw Error("备份文件 SHA-256 校验失败");
    }
  }
}
