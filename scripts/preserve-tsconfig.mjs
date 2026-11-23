import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// 记录运行隔离 Next.js 测试前的 tsconfig.json，测试结束后还原，避免 NEXT_DIST_DIR 污染仓库配置。
export function preserveTsconfig(root = process.cwd()) {
  const path = resolve(root, "tsconfig.json");
  let original = null;
  try {
    original = readFileSync(path, "utf8");
  } catch {
    return () => {};
  }
  return () => {
    try {
      if (readFileSync(path, "utf8") !== original) {
        writeFileSync(path, original, "utf8");
      }
    } catch {}
  };
}
