import { spawn } from "node:child_process";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";

const host = "http://127.0.0.1:3014";
const prisma = new PrismaClient();
let server;
let browser;

function assert(value, message) {
  if (!value) throw new Error(message);
}

async function waitForServer() {
  for (let i = 0; i < 90; i += 1) {
    if (server?.exitCode != null) throw new Error("Next.js exited before test started");
    try {
      const response = await fetch(host + "/api/health", { signal: AbortSignal.timeout(1500) });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 700));
  }
  throw new Error("Local test server never became ready");
}

async function run() {
  if (!process.env.DATABASE_URL?.endsWith("/auth-e2e.db")) {
    throw new Error("Refusing to test a non-ephemeral database");
  }
  const pass = "E2E-only-" + randomBytes(12).toString("hex");
  const partnerPass = "Partner-only-" + randomBytes(12).toString("hex");
  const salt = randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    scryptCallback(pass, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key));
  });
  const passwordHash = "scrypt-v1:" + salt.toString("base64url") + ":" + derived.toString("base64url");
  await prisma.user.upsert({ where: { username: "e2e_owner" }, create: {
    username: "e2e_owner", displayName: "自动化测试管理员", role: "ADMIN", passwordHash,
  }, update: { passwordHash, isActive: true } });
  await prisma.loginThrottle.deleteMany({ where: { username: "e2e_owner" } });

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "--hostname", "127.0.0.1", "-p", "3014"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "development" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Drain output without echoing sensitive request details.
  server.stdout.on("data", () => {});
  let serverErrors = "";
  server.stderr.on("data", (chunk) => { serverErrors = (serverErrors + String(chunk)).slice(-2500); });
  await waitForServer();
  browser = await chromium.launch({
    executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => console.error("BROWSER_ERROR:", error.message.slice(0, 250)));
  const csrfResponse = await page.request.post(host + "/api/auth/login", {
    headers: { Origin: "https://evil.example", "Content-Type": "application/x-www-form-urlencoded" },
    data: "username=e2e_owner&password=wrong",
  });
  assert(csrfResponse.status() === 403, "Cross-origin login attempt was not rejected");
  const publicResponse = await page.goto(host + "/visited");
  assert(publicResponse?.status() === 200, "Public visited page unavailable");
  await page.goto(host + "/admin");
  assert(page.url().endsWith("/login"), "Anonymous admin request was not redirected");


  await page.locator('input[name="username"]').fill("e2e_owner");
  await page.locator('input[name="password"]').fill("wrong-password");
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/login?error=1");
  await page.locator(".form-error").waitFor();
  assert(page.url().includes("/login"), "Invalid credentials unexpectedly logged in");

  await page.locator('input[name="username"]').fill("e2e_owner");
  await page.locator('input[name="password"]').fill(pass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  try {
    await page.waitForURL("**/admin", { timeout: 15000 });
  } catch (error) {
    console.error("LOGIN_E2E_ERROR:", page.url(), serverErrors.slice(-500));
    throw error;
  }
  assert((await page.context().cookies()).some(cookie => cookie.name === "travel_session" && cookie.httpOnly), "Session cookie is missing HttpOnly");

  await page.goto(host + "/admin/tokens");
  await page.getByText("第一次使用 AI 助手").waitFor();
  await page.getByText("travelctl auth login --server " + host).waitFor();
  assert((await page.locator('a[href*="/releases"]').count()) > 0, "Windows executable download entry missing");
  assert((await page.locator('a[href*="/skills/travel-import"]').count()) > 0, "Skill download entry missing");
  await page.locator('input[name="title"]').fill("浏览器集成测试令牌");
  await page.getByRole("button", { name: "生成授权令牌" }).click();
  await page.locator('textarea[aria-label="新授权令牌"]').waitFor({ timeout: 20000 });
  const issuedToken = await page.locator('textarea[aria-label="新授权令牌"]').inputValue();
  assert(/^trv_[A-Za-z0-9_-]{43}$/.test(issuedToken), "Token management page did not return a valid one-time credential");
  await page.reload();
  assert(await page.locator('textarea[aria-label="新授权令牌"]').count() === 0, "Token remained visible after reload");

  await page.goto(host + "/admin/destinations/altay");
  await page.locator('input[name="title"]').fill("阿勒泰·端到端测试");
  await page.getByRole("button", { name: "保存目的地修改" }).click();
  await page.waitForURL("**/admin/destinations/altay?saved=1");
  const dest = await page.goto(host + "/destinations/altay");
  assert(dest?.status() === 200 && (await page.locator("body").innerText()).includes("阿勒泰·端到端测试"), "Destination save failed");

  await page.goto(host + "/admin/flights");
  await page.locator('select[name="destinationId"]').selectOption("altay");
  await page.locator('input[name="route"]').fill("广州往返乌鲁木齐·自动化测试");
  await page.locator('input[name="destinationName"]').fill("乌鲁木齐");
  await page.locator('input[name="totalPrice"]').fill("4567");
  await page.locator('input[name="departureDate"]').fill("2026-11-11");
  await page.locator('input[name="returnDate"]').fill("2026-11-18");
  await page.getByRole("button", { name: "保存机票样本" }).click();
  await page.waitForURL("**/admin/flights?added=1");
  assert((await page.locator("body").innerText()).includes("广州往返乌鲁木齐·自动化测试"), "Flight save failed");
  await page.goto(host + "/destinations/altay");
  assert((await page.locator("body").innerText()).includes("4,567"), "Saved flight evidence not shown on public destination page");

  await page.goto(host + "/admin/places/zhongshan");
  await page.locator('input[name="whenLabel"]').fill("广东的家·测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/zhongshan?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("广东的家·测试"), "Place save failed");

  await page.goto(host + "/admin/users");
  await page.locator('input[name="username"]').fill("wangying_test");
  await page.locator('input[name="displayName"]').fill("测试编辑者");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.locator('input[name="confirm"]').fill(partnerPass);
  await page.getByRole("button", { name: "创建编辑账号" }).click();
  await page.waitForURL("**/admin/users?created=1");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL("**/login");

  await page.locator('input[name="username"]').fill("wangying_test");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  const editorResponse = await page.goto(host + "/admin/places/zhongshan");
  assert(editorResponse?.status() === 200, "Partner editor cannot access edit form");
  await page.locator('input[name="whenLabel"]').fill("广东的家·编辑者测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/zhongshan?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("广东的家·编辑者测试"), "Partner editor cannot edit place");
  const restrictedResponse = await page.goto(host + "/admin/users");
  assert(restrictedResponse?.status() === 404, "Non-admin accessed account-management screen");

  // Changing a password must revoke all existing sessions for this user.
  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await secondaryPage.goto(host + "/login");
  await secondaryPage.locator('input[name="username"]').fill("wangying_test");
  await secondaryPage.locator('input[name="password"]').fill(partnerPass);
  await secondaryPage.getByRole("button", { name: "登录私人后台" }).click();
  await secondaryPage.waitForURL("**/admin");
  const nextPartnerPass = "Changed-only-" + randomBytes(12).toString("hex");
  await page.goto(host + "/admin/account");
  await page.locator('input[name="currentPassword"]').fill(partnerPass);
  await page.locator('input[name="newPassword"]').fill(nextPartnerPass);
  await page.locator('input[name="confirmPassword"]').fill(nextPartnerPass);
  await page.getByRole("button", { name: "更新密码并退出所有设备" }).click();
  await page.waitForURL("**/login?changed=1");
  await secondaryPage.goto(host + "/admin");
  assert(secondaryPage.url().includes("/login"), "Old secondary session was not revoked");
  await secondaryContext.close();
  await page.locator('input[name="username"]').fill("wangying_test");
  await page.locator('input[name="password"]').fill(nextPartnerPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  await page.goto(host + "/admin");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL("**/login");
  await page.goto(host + "/admin");
  assert(page.url().endsWith("/login"), "Logout did not revoke session");

  console.log("E2E_PASS: public pages, anonymous protection, login, destination save, flight save, place save, partner role, password rotation, multi-device session revocation, logout");
}

try {
  await run();
} catch (error) {
  console.error("E2E_FAIL:", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server) {
    server.kill("SIGTERM");
    await new Promise(resolve => {
      if (server.exitCode !== null) return resolve();
      server.once("exit", resolve);
      setTimeout(resolve, 2500).unref();
    });
  }
  await prisma.$disconnect();
}
