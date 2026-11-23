import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

/** 逐块校验文件，供网页备份和离线恢复共用。 @param {string} path */
export async function fileChecksum(path) {
  const hash = createHash("sha256");
  let size = 0;
  for await (const part of createReadStream(path)) { hash.update(part); size += part.length; }
  return { size, sha256: hash.digest("hex") };
}
