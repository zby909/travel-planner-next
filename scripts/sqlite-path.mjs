import { resolve } from "node:path";

// Prisma 的相对 SQLite 地址以 schema.prisma 所在目录为基准。
export function sqliteDatabasePath(databaseUrl, schemaDirectory = resolve("prisma")) {
  const raw = databaseUrl?.startsWith("file:") ? databaseUrl.slice(5).split("?")[0] : "";
  if (!raw || raw === ":memory:") throw Error("需要 SQLite 数据库文件路径");
  return resolve(schemaDirectory, raw);
}
