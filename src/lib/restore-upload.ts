import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isBlankForRestore, prepareRestorePath, restoreRoot, type BackupPreview } from "@/lib/backup-restore";
import { BACKUP_SIZE_LABEL, MAX_BACKUP_ZIP } from "@/lib/backup-format";

export const RESTORE_CHUNK_SIZE = 512 * 1024;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
type UploadSession = {
  id: string;
  ownerId: string;
  filename: string;
  size: number;
  sha256: string;
  digestMode?: "file" | "chunks";
  chunkSize: number;
  chunkCount: number;
  chunkHashes: string[];
  createdAt: string;
  expiresAt: string;
};
const uploadRoot = () => join(restoreRoot(), "upload-chunks");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);
const finalizing = new Set<string>();

// 一次替换完整清单，续传扫描不会读到写了一半的 JSON。
async function writeSession(folder: string, session: UploadSession) {
  const temporary = join(folder, randomUUID() + ".tmp");
  try {
    await writeFile(temporary, JSON.stringify(session), { flag: "wx", mode: 0o600 });
    await rename(temporary, join(folder, "session.json"));
  } finally {
    await rm(temporary, { force: true });
  }
}

async function readSession(id: string, ownerId: string) {
  if (!validId(id)) throw Error("上传任务编号不合法");
  const folder = join(uploadRoot(), id);
  const raw = await readFile(join(folder, "session.json"), "utf8").catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") throw Error("上传任务不存在或已过期，请重新选择文件");
    throw error;
  });
  let session: UploadSession;
  try { session = JSON.parse(raw) as UploadSession; } catch { throw Error("上传任务状态已损坏，请重新选择文件"); }
  if (session.id !== id || session.ownerId !== ownerId) throw Error("上传任务不存在或不属于当前管理员");
  if (Date.now() > Date.parse(session.expiresAt)) {
    await rm(folder, { recursive: true, force: true });
    throw Error("上传任务已过期，请重新选择文件");
  }
  return { folder, session };
}

async function receivedChunks(folder: string, session: UploadSession) {
  const received: number[] = [];
  for (let index = 0; index < session.chunkCount; index++) {
    const path = join(folder, index + ".part");
    try {
      const bytes = await readFile(path);
      const expectedSize = Math.min(session.chunkSize, session.size - index * session.chunkSize);
      if (bytes.length === expectedSize && hash(bytes) === session.chunkHashes[index]) received.push(index);
      else await rm(path, { force: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return received;
}

export async function beginRestoreUpload(input: unknown, ownerId: string) {
  if (!input || typeof input !== "object") throw Error("上传参数无效");
  const value = input as Record<string, unknown>;
  const filename = value.filename;
  const size = value.size;
  const sha256 = value.sha256;
  const chunkHashes = value.chunkHashes;
  const digestMode = value.digestMode === undefined ? "file" : value.digestMode;
  if (digestMode !== "file" && digestMode !== "chunks") throw Error("文件校验方式无效");
  if (typeof filename !== "string" || filename.length > 180 || !filename.toLowerCase().endsWith(".zip"))
    throw Error("请选择 ZIP 备份文件");
  if (typeof size !== "number" || !Number.isInteger(size) || size < 100 || size > MAX_BACKUP_ZIP)
    throw Error(`ZIP 大小需在 100 B 到 ${BACKUP_SIZE_LABEL} 之间`);
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error("文件 SHA-256 格式无效");
  const chunkCount = Math.ceil(size / RESTORE_CHUNK_SIZE);
  if (!Array.isArray(chunkHashes) || chunkHashes.length !== chunkCount
    || chunkHashes.some(item => typeof item !== "string" || !/^[a-f0-9]{64}$/.test(item)))
    throw Error("分块校验信息无效");
  if (digestMode === "chunks" && hash(Buffer.from(JSON.stringify(chunkHashes))) !== sha256) throw Error("分块清单校验失败");
  if (!await isBlankForRestore()) throw Error("仅允许在没有旅行数据的新实例恢复；请先备份现有站点");

  const root = uploadRoot();
  await mkdir(root, { recursive: true, mode: 0o700 });
  let active = 0;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !validId(entry.name)) continue;
    const folder = join(root, entry.name);
    try {
      const session = JSON.parse(await readFile(join(folder, "session.json"), "utf8")) as UploadSession;
      if (Date.now() > Date.parse(session.expiresAt)) {
        await rm(folder, { recursive: true, force: true });
        continue;
      }
      if (session.ownerId === ownerId && session.sha256 === sha256 && session.size === size && (session.digestMode ?? "file") === digestMode) {
        if (JSON.stringify(session.chunkHashes) !== JSON.stringify(chunkHashes))
          throw Error("同一文件的分块校验信息不一致");
        session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await writeSession(folder, session);
        return {
          uploadId: session.id, chunkSize: session.chunkSize, chunkCount: session.chunkCount,
          receivedChunks: await receivedChunks(folder, session), expiresAt: session.expiresAt, resumed: true,
        };
      }
      active++;
    } catch (error) {
      if (error instanceof SyntaxError || (error as NodeJS.ErrnoException).code === "ENOENT") {
        // 创建时目录会先于清单出现，也可能来自上次中断的上传。
        const info = await stat(folder).catch((cause: NodeJS.ErrnoException) => {
          if (cause.code !== "ENOENT") throw cause;
          return null;
        });
        if (info && info.mtimeMs < Date.now() - SESSION_TTL_MS) await rm(folder, { recursive: true, force: true });
        continue;
      }
      throw error;
    }
  }
  if (active >= 2) throw Error("已有两个未完成的上传任务，请稍后再试");
  const id = randomUUID();
  const folder = join(root, id);
  await mkdir(folder, { mode: 0o700 });
  const session: UploadSession = {
    id, ownerId, filename, size, sha256, digestMode, chunkSize: RESTORE_CHUNK_SIZE, chunkCount,
    chunkHashes: chunkHashes as string[], createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  await writeSession(folder, session);
  return { uploadId: id, chunkSize: RESTORE_CHUNK_SIZE, chunkCount, receivedChunks: [], expiresAt: session.expiresAt, resumed: false };
}

export async function saveRestoreChunk(id: string, ownerId: string, index: number, bytes: Buffer, declaredHash: string) {
  const { folder, session } = await readSession(id, ownerId);
  if (!Number.isInteger(index) || index < 0 || index >= session.chunkCount) throw Error("分块序号无效");
  const expectedSize = Math.min(session.chunkSize, session.size - index * session.chunkSize);
  if (bytes.length !== expectedSize) throw Error("分块大小不正确，请重试");
  const actualHash = hash(bytes);
  if (actualHash !== declaredHash || actualHash !== session.chunkHashes[index])
    throw Error("分块校验失败，请重新上传该分块");
  const path = join(folder, index + ".part");
  try {
    await writeFile(path, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const existing = await readFile(path);
    if (existing.length !== bytes.length || hash(existing) !== actualHash)
      throw Error("服务器已有同序号但内容不同的分块，请重新开始上传");
  }
  return { received: index };
}

// 一次读取一个分块写到临时 ZIP，兼容旧客户端的整文件校验，并防止同任务并发合并。
export async function finishRestoreUpload(id: string, ownerId: string): Promise<BackupPreview> {
  if (finalizing.has(id)) throw Error("该上传任务正在校验合并，请稍候");
  finalizing.add(id);
  try {
    const { folder, session } = await readSession(id, ownerId);
    const path = join(folder, `archive-${randomUUID()}.zip`);
    const output = await open(path, "wx", 0o600);
    const checksum = session.digestMode === "chunks" ? null : createHash("sha256");
    let verified = false;
    try {
      try {
        for (let index = 0; index < session.chunkCount; index++) {
          const bytes = await readFile(join(folder, index + ".part")).catch(() => null);
          const expectedSize = Math.min(session.chunkSize, session.size - index * session.chunkSize);
          if (!bytes || bytes.length !== expectedSize || hash(bytes) !== session.chunkHashes[index])
            throw Error("上传尚未完成，缺少或损坏第 " + (index + 1) + " 个分块");
          checksum?.update(bytes);
          await output.writeFile(bytes);
        }
      } finally { await output.close(); }
      if (checksum && checksum.digest("hex") !== session.sha256) {
        await rm(folder, { recursive: true, force: true });
        throw Error("整份 ZIP 的 SHA-256 不匹配，请重新选择文件");
      }
      verified = true;
      const preview = await prepareRestorePath(path, session.filename, ownerId);
      await rm(folder, { recursive: true, force: true });
      return preview;
    } catch (error) {
      if (verified) await rm(folder, { recursive: true, force: true });
      else await rm(path, { force: true });
      throw error;
    }
  } finally {
    finalizing.delete(id);
  }
}
