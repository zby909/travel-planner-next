import { PrismaClient } from "@prisma/client";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const prisma = new PrismaClient();

function readSecret(label) {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== "function") {
      reject(new Error("需要交互终端设置密码。请通过 PowerShell 或 docker exec -it 运行本命令。"));
      return;
    }
    let buffer = "";
    const wasRaw = Boolean(process.stdin.isRaw);
    process.stdout.write(label);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    function finish(error) {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(wasRaw);
      process.stdout.write("\n");
      if (error) reject(error);
      else resolve(buffer);
    }
    function onData(data) {
      for (const char of data.toString("utf8")) {
        if (char === "\u0003") return finish(new Error("输入已取消"));
        if (char === "\r" || char === "\n") return finish();
        if (char === "\u007f" || char === "\b") {
          buffer = buffer.slice(0, -1);
        } else if (buffer.length < 128 && char >= " ") {
          buffer += char;
        }
      }
    }
    process.stdin.on("data", onData);
  });
}

async function main() {
  const [username, displayName, role = "EDITOR"] = process.argv.slice(2);
  if (!username || !/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("用户名必须是3–40位小写字母、数字、点、下划线或短横线");
  if (!displayName || displayName.length > 80) throw new Error("请提供显示名称（最长80字）");
  if (!["ADMIN", "EDITOR"].includes(role)) throw new Error("角色只能是 ADMIN 或 EDITOR");
  const exists = await prisma.user.findUnique({ where: { username } });
  if (exists) throw new Error("该账号已存在；不会自动覆盖现有密码");
  const password = await readSecret("新密码（输入不可见，至少12位）：");
  const again = await readSecret("确认新密码：");
  if (password.length < 12 || password.length > 128 || password !== again) throw new Error("密码长度不足12位、超过128位或两次输入不一致");
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 });
  await prisma.user.create({
    data: {
      username,
      displayName,
      role,
      passwordHash: `scrypt-v1:${salt.toString("base64url")}:${hash.toString("base64url")}`,
    },
  });
  console.log(`已创建账号：${username}（${role}）。密码未输出，也未保存为明文。`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "创建账号失败");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
