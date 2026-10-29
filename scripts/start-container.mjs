import { spawn, spawnSync } from "node:child_process";

// The portable open-source image deliberately starts with an empty SQLite database.
// Prisma migrations are applied by the Docker entrypoint; personal travel data is
// restored separately from a private backup into the persistent /app/data volume.
console.log("Travel Planner: keeping existing SQLite data, no bundled personal seed.");

const bootstrap = spawnSync(process.execPath, ["scripts/bootstrap-admin.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (bootstrap.status !== 0) {
  console.error("管理员初始化检查失败；为保护已有账号，拒绝启动 Web 服务。");
  process.exit(1);
}

const mediaCleanup = spawnSync(process.execPath, ["scripts/prune-staged-media.mjs"], {
  stdio: "inherit",
  env: process.env,
});
if (mediaCleanup.status !== 0) console.warn("Image cleanup will retry on next restart.");

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
