import "server-only";
import { randomBytes, scrypt, timingSafeEqual, createHash } from "node:crypto";

// Memory-hard scrypt setting (OWASP-equivalent: N=2^15, r=8, p=3).
const params = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const prefix = "scrypt-v1";
const dummySalt = Buffer.from("00280c6f12687384b9ef463feaab8612", "hex");

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, params, (err, key) => err ? reject(err) : resolve(key));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 128) throw new Error("密码长度必须为 12—128 位");
  const salt = randomBytes(16);
  const key = await derive(password, salt);
  return `${prefix}:${salt.toString("base64url")}:${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const parts = encoded?.split(":") ?? [];
  const valid = parts.length === 3 && parts[0] === prefix;
  let salt = dummySalt;
  let expected = Buffer.alloc(64);
  if (valid) {
    const rawSalt = Buffer.from(parts[1], "base64url");
    const rawKey = Buffer.from(parts[2], "base64url");
    if (rawSalt.length === 16 && rawKey.length === 64) {
      salt = rawSalt;
      expected = rawKey;
    }
  }
  const computed = await derive(password, salt);
  return valid && timingSafeEqual(expected, computed);
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
