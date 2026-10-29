import { spawnSync } from "node:child_process";
const r = spawnSync(process.execPath, ["scripts/test-backup-restore-e2e.mjs"], {
  cwd: process.cwd(), stdio: "inherit",
});
process.exitCode = r.status || 0;
