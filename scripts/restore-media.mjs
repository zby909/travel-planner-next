import { constants } from "node:fs";
import { copyFile, link, lstat, mkdir, open, readFile, readdir, rmdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";

// 为恢复媒体建立可重放的复制清单，进程中断后不会把自己复制的文件误判成冲突。
async function mediaPlan(folder, data) {
  const entries = [];
  const roots = {
    uploads: resolve(process.env.UPLOAD_DIR || join(data, "uploads")),
    "legacy-images": resolve(process.env.LEGACY_MEDIA_DIR || join(data, "legacy-images")),
  };
  // 只递归读取隔离目录中的普通文件，不接受符号链接或非法名字。
  async function walk(kind, relative = "") {
    const source = join(folder, kind, relative);
    const children = await readdir(source, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
    for (const child of children) {
      if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/.test(child.name) || child.isSymbolicLink()) throw Error("恢复图片路径不安全");
      const name = relative ? `${relative}/${child.name}` : child.name;
      if (child.isDirectory()) await walk(kind, name);
      else if (child.isFile()) {
        const from = join(source, child.name);
        entries.push({ kind, name, sha256: createHash("sha256").update(await readFile(from)).digest("hex"), from, to: join(roots[kind], name) });
      } else throw Error("恢复图片不能含特殊文件");
    }
  }
  await walk("legacy-images");
  await walk("uploads");
  return { roots, entries };
}

// 任务专属临时文件与目标放在同一目录，保证原子发布不跨文件系统。
export function restoreMediaTempPath(folder, target) {
  const id = createHash("sha256").update(resolve(folder) + "\0" + resolve(target)).digest("hex");
  return join(dirname(target), `.restore-${id}.part`);
}

// 回退时仅删除本任务声明拥有、且内容未被改动的文件，不触碰原站文件。
async function rollbackPlan(folder, plan) {
  let changed = false;
  for (const entry of plan.entries) {
    await rm(restoreMediaTempPath(folder, entry.to), { force: true });
    try {
      const bytes = await readFile(entry.to);
      if (createHash("sha256").update(bytes).digest("hex") !== entry.sha256) { changed = true; continue; }
      await rm(entry.to);
      let directory = dirname(entry.to);
      while (directory !== plan.roots[entry.kind]) {
        try { await rmdir(directory); } catch { break; }
        directory = dirname(directory);
      }
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  if (changed) throw Error("恢复目标内容已被改变；保留媒体所有权清单，请检查后重试");
  await rm(join(folder, "media-install.json"), { force: true });
}

// 重放只接受已经完整发布的同任务文件，不覆盖原站或被人工改动的内容。
async function hasInstalledMedia(entry) {
  const info = await lstat(entry.to).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (info === null) return false;
  if (!info.isFile() || info.isSymbolicLink() || createHash("sha256").update(await readFile(entry.to)).digest("hex") !== entry.sha256) {
    throw Error("恢复目标文件与本次任务不一致，拒绝覆盖");
  }
  return true;
}

// 在旧数据库仍可回退时安全落盘图片；失败会清理本次已经复制的文件。
export async function installRestoreMedia(folder, data) {
  const plan = await mediaPlan(folder, data);
  const marker = join(folder, "media-install.json");
  const ownership = JSON.stringify(plan.entries.map(({ kind, name, sha256 }) => ({ kind, name, sha256 })));
  const saved = await readFile(marker, "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (saved !== null && saved !== ownership) throw Error("恢复媒体清单发生变化，拒绝覆盖");
  if (saved === null) {
    for (const entry of plan.entries) {
      const exists = await lstat(entry.to).catch(error => { if (error.code === "ENOENT") return null; throw error; });
      if (exists) throw Error("已有同名媒体文件，拒绝覆盖：" + entry.name);
    }
    // 先记录所有权意图，再复制文件；每个目标已经确认不存在。
    await writeFile(marker, ownership, { flag: "wx", mode: 0o600 });
  }
  try {
    for (const entry of plan.entries) {
      await mkdir(dirname(entry.to), { recursive: true, mode: 0o700 });
      const temp = restoreMediaTempPath(folder, entry.to);
      if (await hasInstalledMedia(entry)) {
        await rm(temp, { force: true });
        continue;
      }
      // 半文件只会留在任务专属临时路径，重放时可以安全清除并重新复制。
      await rm(temp, { force: true });
      await copyFile(entry.from, temp, constants.COPYFILE_EXCL);
      if (createHash("sha256").update(await readFile(temp)).digest("hex") !== entry.sha256) throw Error("恢复图片复制校验失败");
      const handle = await open(temp, "r+");
      try { await handle.sync(); } finally { await handle.close(); }
      // hard-link 在同一文件系统原子创建目标；与 rename 不同，目标存在时绝不覆盖。
      try { await link(temp, entry.to); }
      catch (error) {
        if (error.code !== "EEXIST" || !await hasInstalledMedia(entry)) throw error;
      }
      await rm(temp, { force: true });
    }
  } catch (error) { await rollbackPlan(folder, plan); throw error; }
  return () => rollbackPlan(folder, plan);
}

// 数据库切换中断并回退后，撤回同一任务安装的媒体文件。
export async function rollbackRestoreMedia(folder, data) {
  const marker = await readFile(join(folder, "media-install.json"), "utf8").catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (marker === null) return;
  const plan = await mediaPlan(folder, data);
  const ownership = JSON.stringify(plan.entries.map(({ kind, name, sha256 }) => ({ kind, name, sha256 })));
  if (ownership !== marker) throw Error("恢复媒体回退清单不匹配");
  await rollbackPlan(folder, plan);
}
