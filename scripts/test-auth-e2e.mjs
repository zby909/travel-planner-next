import { spawn } from "node:child_process";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import sharp from "sharp";

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


  const invalidCredentials = await page.request.post(host + "/api/auth/login", {
    headers: { Origin: host, "Content-Type": "application/x-www-form-urlencoded" },
    data: "username=e2e_owner&password=wrong-password",
    maxRedirects: 0,
  });
  assert(invalidCredentials.status() === 303 && (invalidCredentials.headers().location ?? "").includes("error=1"),
    "Invalid credentials were not rejected with the expected login redirect");

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

  await page.goto(host + "/admin/restore");
  await page.getByText("站点已有旅行记录").waitFor();
  assert(await page.locator('input[type="file"]').count() === 0, "Backup upload must be disabled on nonempty site");

  await page.goto(host + "/admin/settings");
  await page.locator('input[name="siteName"]').fill("自动化旅行档案");
  await page.locator('input[name="siteSubtitle"]').fill("AUTOMATED TRAVEL JOURNAL");
  await page.locator('input[name="primaryMemberName"]').fill("旅行者甲");
  await page.locator('input[name="secondaryMemberName"]').fill("旅行者乙");
  await page.locator('input[name="togetherLabel"]').fill("共同旅行");
  await page.locator('select[name="currency"]').selectOption("SGD");
  await page.getByRole("button", { name: "保存站点设置" }).click();
  await page.waitForURL("**/admin/settings?saved=1");
  await page.goto(host + "/");
  assert((await page.locator("header .brand-name").innerText()).includes("自动化旅行档案"), "Site brand setting was not applied");

  await page.goto(host + "/admin/destinations/new");
  await page.locator('input[name="title"]').fill("新增目的地·端到端测试");
  await page.locator('input[name="subtitle"]').fill("自动化测试地区");
  await page.locator('input[name="kind"]').fill("城市");
  await page.locator('input[name="types"]').fill("城市，美食");
  await page.locator('input[name="seasons"]').fill("春，秋");
  await page.locator('input[name="months"]').fill("4—5 月");
  await page.locator('input[name="days"]').fill("3 天");
  await page.locator('input[name="spots"]').fill("测试老街，测试博物馆");
  await page.getByRole("button", { name: "创建目的地" }).click();
  await page.waitForURL(url => url.pathname.startsWith("/admin/destinations/") && url.searchParams.get("created") === "1");
  const createdDestinationId = new URL(page.url()).pathname.split("/").at(-1);
  const homeResponse = await page.goto(host + "/");
  assert(homeResponse?.status() === 200 && (await page.locator("body").innerText()).includes("新增目的地·端到端测试"), "Manually created destination was not shown on home page");
  await page.locator(".filter-scroll").getByRole("button", { name: "美食" }).waitFor();
  await page.goto(host + `/admin/destinations/${createdDestinationId}`);
  assert((await page.locator("body").innerText()).includes("两人旅行总预算（SGD）"), "Configured currency was not applied to destination editor");
  const photoBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#628c91" } }).png().toBuffer();
  await page.locator('input[name="image"]').setInputFiles({ name: "journey.png", mimeType: "image/png", buffer: photoBuffer });
  await page.getByRole("button", { name: "保存封面照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photo") === "1");
  await page.goto(host + "/");
  const destinationCover = await page.locator(".trip-card").filter({ hasText: "新增目的地·端到端测试" }).locator("img").first().getAttribute("src");
  assert(/^\/api\/media\/[a-f0-9-]{36}$/.test(destinationCover ?? ""), "Web-uploaded destination cover not present on shared wishlist");
  const destinationCoverResponse = await page.request.get(host + destinationCover);
  assert(destinationCoverResponse.ok() && destinationCoverResponse.headers()["content-type"] === "image/webp", "Destination cover file not publicly readable");

  await page.goto(host + "/admin/places/new");
  await page.locator('input[name="name"]').fill("新增足迹·端到端测试");
  await page.locator('input[name="region"]').fill("自动化测试地区");
  await page.locator('select[name="group"]').selectOption("her");
  await page.locator('input[name="whenLabel"]').fill("2026 年春季");
  await page.locator('input[name="country"]').fill("测试国家");
  await page.locator('input[name="province"]').fill("测试省份");
  await page.locator('input[name="city"]').fill("测试城市");
  await page.locator('input[name="latitude"]').fill("31.2");
  await page.locator('input[name="longitude"]').fill("121.5");
  await page.getByRole("button", { name: "新增足迹地点" }).click();
  await page.waitForURL(url => url.pathname.startsWith("/admin/places/") && url.searchParams.get("created") === "1");
  await page.locator('input[name="image"]').setInputFiles({ name: "memory.png", mimeType: "image/png", buffer: photoBuffer });
  await page.getByRole("button", { name: "保存封面照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photo") === "1");
  await page.goto(host + "/visited");
  const visitedText = await page.locator("body").innerText();
  assert(visitedText.includes("新增足迹·端到端测试") && visitedText.includes("旅行者乙单独去过"), "Manually created place or custom member label was not shown");
  const placeCover = await page.locator(".place-card").filter({ hasText: "新增足迹·端到端测试" }).locator("img").getAttribute("src");
  assert(/^\/api\/media\/[a-f0-9-]{36}$/.test(placeCover ?? ""), "Web-uploaded visited photo not shown in shared archive");
  const placeCoverResponse = await page.request.get(host + placeCover);
  assert(placeCoverResponse.ok() && placeCoverResponse.headers()["content-type"] === "image/webp", "Visited cover file not publicly readable");

  await page.goto(host + "/admin/destinations/test-island");
  await page.locator('input[name="title"]').fill("虚构岛屿·端到端测试");
  await page.getByRole("button", { name: "保存目的地修改" }).click();
  await page.waitForURL("**/admin/destinations/test-island?saved=1");
  const dest = await page.goto(host + "/destinations/test-island");
  assert(dest?.status() === 200 && (await page.locator("body").innerText()).includes("虚构岛屿·端到端测试"), "Destination save failed");

  await page.goto(host + "/admin/flights");
  await page.locator('select[name="destinationId"]').selectOption("test-island");
  await page.locator('input[name="route"]').fill("示例城市往返虚构岛屿·自动化测试");
  await page.locator('input[name="origin"]').fill("示例城市");
  await page.locator('input[name="destinationName"]').fill("虚构岛屿");
  await page.locator('input[name="totalPrice"]').fill("4567");
  await page.locator('input[name="departureDate"]').fill("2026-11-11");
  await page.locator('input[name="returnDate"]').fill("2026-11-18");
  await page.getByRole("button", { name: "保存机票样本" }).click();
  await page.waitForURL("**/admin/flights?added=1");
  assert((await page.locator("body").innerText()).includes("示例城市往返虚构岛屿·自动化测试"), "Flight save failed");
  await page.goto(host + "/destinations/test-island");
  assert((await page.locator("body").innerText()).includes("4,567"), "Saved flight evidence not shown on public destination page");

  await page.goto(host + "/admin/places/test-town");
  await page.locator('input[name="whenLabel"]').fill("示例小镇·测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/test-town?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("示例小镇·测试"), "Place save failed");

  await page.goto(host + "/admin/users");
  await page.locator('input[name="username"]').fill("partner_test");
  await page.locator('input[name="displayName"]').fill("测试编辑者");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.locator('input[name="confirm"]').fill(partnerPass);
  await page.getByRole("button", { name: "创建编辑账号" }).click();
  await page.waitForURL("**/admin/users?created=1");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL("**/login");

  await page.locator('input[name="username"]').fill("partner_test");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  const editorResponse = await page.goto(host + "/admin/places/test-town");
  assert(editorResponse?.status() === 200, "Partner editor cannot access edit form");
  await page.locator('input[name="whenLabel"]').fill("示例小镇·编辑者测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/test-town?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("示例小镇·编辑者测试"), "Partner editor cannot edit place");
  const restrictedResponse = await page.goto(host + "/admin/users");
  assert(restrictedResponse?.status() === 404, "Non-admin accessed account-management screen");
  const restrictedRestore = await page.goto(host + "/admin/restore");
  assert(restrictedRestore?.status() === 404, "Non-admin accessed backup restore screen");
  const restrictedSettings = await page.goto(host + "/admin/settings");
  assert(restrictedSettings?.status() === 404, "Non-admin accessed site settings screen");

  // Changing a password must revoke all existing sessions for this user.
  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await secondaryPage.goto(host + "/login");
  await secondaryPage.locator('input[name="username"]').fill("partner_test");
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
  await page.locator('input[name="username"]').fill("partner_test");
  await page.locator('input[name="password"]').fill(nextPartnerPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  await page.goto(host + "/admin");
  await page.getByRole("button", { name: "退出登录" }).click();
  await page.waitForURL("**/login");
  await page.goto(host + "/admin");
  assert(page.url().endsWith("/login"), "Logout did not revoke session");

  console.log("E2E_PASS: public pages, auth, site branding, member labels, currency, destination/place creation and web photo uploads, edits, partner permissions, password rotation, session revocation, logout");
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
