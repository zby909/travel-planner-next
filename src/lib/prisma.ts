import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaConfigured?: boolean };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// 在运行期为 SQLite 启用 WAL 模式和忙等待超时，提升并发读与写入稳定性。
async function configureSqlite(client: PrismaClient) {
  try {
    await client.$queryRawUnsafe("PRAGMA busy_timeout = 5000");
    await client.$queryRawUnsafe("PRAGMA journal_mode = WAL");
    await client.$queryRawUnsafe("PRAGMA synchronous = NORMAL");
  } catch {
    // 非 SQLite 或构建阶段无库文件时静默忽略。
  }
}

if (!globalForPrisma.prismaConfigured && process.env.NEXT_PHASE !== "phase-production-build") {
  globalForPrisma.prismaConfigured = true;
  void configureSqlite(prisma);
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
