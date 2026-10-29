import { spawn, spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const seedMarker = await prisma.appSetting.findUnique({ where: { key: "legacy_seed_v1" } });
  if (!seedMarker) {
    console.log("Initial seed marker missing; importing bundled travel data once.");
    const result = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "prisma/seed.ts"], {
      stdio: "inherit",
      env: process.env,
    });
    if (result.status !== 0) {
      throw new Error("Initial database seed failed.");
    }
  } else {
    console.log("Initial seed is complete; preserving all existing database records.");
  }
} finally {
  await prisma.$disconnect();
}

const bootstrap = spawnSync(process.execPath, ["scripts/bootstrap-admin.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (bootstrap.status !== 0) {
  console.error("管理员初始化检查失败；为保护已有账号，拒绝启动 Web 服务。");
  process.exit(1);
}

const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

server.on("error", (error) => {
  console.error("Failed to start Next.js:", error);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
