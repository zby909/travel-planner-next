import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MAX_BACKUP_ZIP, isBlankForRestore, prepareRestoreBytes, restoreRoot, type BackupPreview } from "@/lib/backup-restore";

export const RESTORE_CHUNK_SIZE = 512 * 1024;
const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
type UploadSession = {
  id: string;
  ownerId: string;
  filename: string;
  size: number;
  sha256: string;
  chunkSize: number;
  chunkCount: number;
  chunkHashes: string[];
  createdAt: string;
  expiresAt: string;
};
const uploadRoot = () => join(restoreRoot(), "upload-chunks");
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const validId = (id: string) => /^[0-9a-f-]{36}$/.test(id);

async function readSession(id: string, ownerId: string) {
  if (!validId(id)) throw Error("上传任务编号不合法");
  const folder = join(uploadRoot(), id);
  const session = JSON.parse(await readFile(join(folder, "session.json"), "utf8")) as UploadSession;
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
  if (typeof filename !== "string" || filename.length > 180 || !filename.toLowerCase().endsWith(".zip"))
    throw Error("请选择 ZIP 备份文件");
  if (typeof size !== "number" || !Number.isInteger(size) || size < 100 || size > MAX_BACKUP_ZIP)
    throw Error("ZIP 大小需在 100 B 到 48 MiB 之间");
  if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256))
    throw Error("文件 SHA-256 格式无效");
  const chunkCount = Math.ceil(size / RESTORE_CHUNK_SIZE);
  if (!Array.isArray(chunkHashes) || chunkHashes.length !== chunkCount
    || chunkHashes.some(item => typeof item !== "string" || !/^[a-f0-9]{64}$/.test(item)))
    throw Error("分块校验信息无效");
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
      if (session.ownerId === ownerId && session.sha256 === sha256 && session.size === size) {
        if (JSON.stringify(session.chunkHashes) !== JSON.stringify(chunkHashes))
          throw Error("同一文件的分块校验信息不一致");
        session.expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
        await writeFile(join(folder, "session.json"), JSON.stringify(session), { mode: 0o600 });
        return {
          uploadId: session.id, chunkSize: session.chunkSize, chunkCount: session.chunkCount,
          receivedChunks: await receivedChunks(folder, session), expiresAt: session.expiresAt, resumed: true,
        };
      }
      active++;
    } catch (error) {
      if (error instanceof SyntaxError) {
        await rm(folder, { recursive: true, force: true });
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
    id, ownerId, filename, size, sha256, chunkSize: RESTORE_CHUNK_SIZE, chunkCount,
    chunkHashes: chunkHashes as string[], createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  };
  await writeFile(join(folder, "session.json"), JSON.stringify(session), { flag: "wx", mode: 0o600 });
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

export async function finishRestoreUpload(id: string, ownerId: string): Promise<BackupPreview> {
  const { folder, session } = await readSession(id, ownerId);
  const chunks: Buffer[] = [];
  for (let index = 0; index < session.chunkCount; index++) {
    const bytes = await readFile(join(folder, index + ".part")).catch(() => null);
    const expectedSize = Math.min(session.chunkSize, session.size - index * session.chunkSize);
    if (!bytes || bytes.length !== expectedSize || hash(bytes) !== session.chunkHashes[index])
      throw Error("上传尚未完成，缺少或损坏第 " + (index + 1) + " 个分块");
    chunks.push(bytes);
  }
  const archive = Buffer.concat(chunks, session.size);
  if (archive.length !== session.size || hash(archive) !== session.sha256) {
    await rm(folder, { recursive: true, force: true });
    throw Error("整份 ZIP 的 SHA-256 不匹配，请重新选择文件");
  }
  try {
    const preview = await prepareRestoreBytes(archive, session.filename, ownerId);
    await rm(folder, { recursive: true, force: true });
    return preview;
  } catch (error) {
    await rm(folder, { recursive: true, force: true });
    throw error;
  }
}
