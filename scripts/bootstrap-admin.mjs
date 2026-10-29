import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

function hashPassword(password) {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(
        `scrypt-v1:${salt.toString("base64url")}:${key.toString("base64url")}`
      ));
  });
}

async function main() {
  const existing = await db.user.count();
  if (existing > 0) {
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      console.warn("管理员账号已存在；初始化凭据不会覆盖旧密码。请从部署环境变量中删除 BOOTSTRAP_ADMIN_PASSWORD。");
    }
    return;
  }

  const marker = await db.appSetting.findUnique({ where: { key: "admin_bootstrap_v1" } });
  if (marker) {
    throw new Error("管理员初始化标记已存在，但账号表为空。出于安全考虑，拒绝重新创建默认账号。");
  }

  const username = (process.env.BOOTSTRAP_ADMIN_USERNAME || "owner").trim().toLowerCase();
  const displayName = (process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME || "管理员").trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!password) {
    console.warn("尚未创建管理员账号。请在 StackNest 设置 BOOTSTRAP_ADMIN_PASSWORD（至少 12 位），然后重启容器。");
    return;
  }
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("BOOTSTRAP_ADMIN_USERNAME 格式无效");
  if (!displayName || displayName.length > 80) throw new Error("BOOTSTRAP_ADMIN_DISPLAY_NAME 长度无效");
  if (password.length < 12 || password.length > 128) throw new Error("BOOTSTRAP_ADMIN_PASSWORD 必须是 12—128 位密码");

  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.user.create({ data: { username, displayName, passwordHash, role: "ADMIN" } });
    await tx.appSetting.create({ data: { key: "admin_bootstrap_v1", value: "completed" } });
  });
  console.log(`首次管理员账号已创建（用户名：${username}）。请登录后台修改密码，然后从部署环境变量删除 BOOTSTRAP_ADMIN_PASSWORD。`);
}

try {
  await main();
} catch (error) {
  console.error("管理员初始化失败：", error instanceof Error ? error.message : "未知错误");
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
