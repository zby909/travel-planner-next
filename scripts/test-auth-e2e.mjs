import { spawn } from "node:child_process";
import { randomBytes, scrypt as scryptCallback } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright-core";
import sharp from "sharp";
import { verifyRecordLoops } from "./test-record-loops.mjs";
import { verifyPhotoUpload } from "./test-photo-upload.mjs";

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
    env: { ...process.env, NODE_ENV: "development", NEXT_DIST_DIR: ".next-auth-e2e" },
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
    data: "username=e2e_owner&password=wrong-password&next=https%3A%2F%2Fevil.example",
    maxRedirects: 0,
  });
  const invalidLoginLocation = invalidCredentials.headers().location ?? "";
  assert(invalidCredentials.status() === 303 && invalidLoginLocation.includes("error=1") && !invalidLoginLocation.includes("evil.example"),
    "Invalid credentials or an unsafe next URL were not handled with a safe login redirect");

  await page.locator('input[name="username"]').fill("e2e_owner");
  await page.locator('input[name="password"]').fill(pass);
  try {
    await page.getByRole("button", { name: "登录私人后台" }).click();
    await page.waitForURL("**/admin", { timeout: 15000 });
  } catch (error) {
    console.error("LOGIN_E2E_ERROR:", page.url(), (await page.locator("body").innerText()).slice(-1000), serverErrors.slice(-1800));
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
  assert(await page.locator('select[name="visibility"]').inputValue() === "PUBLIC", "A fresh site must default to public visibility");
  assert(!(await prisma.appSetting.findUnique({ where: { key: "visibility" } })), "Public visibility should not require a seeded database row");
  await page.locator('input[name="siteName"]').fill("自动化旅行档案");
  await page.locator('input[name="siteSubtitle"]').fill("AUTOMATED TRAVEL JOURNAL");
  await page.locator('input[name="primaryMemberName"]').fill("旅行者甲");
  await page.locator('input[name="secondaryMemberName"]').fill("旅行者乙");
  await page.locator('input[name="togetherLabel"]').fill("共同旅行");
  await page.locator('select[name="currency"]').selectOption("SGD");
  await page.locator('select[name="visibility"]').selectOption("PUBLIC");
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
  await page.locator('textarea[name="spotItems"]').fill("测试老街\n测试博物馆");
  await page.locator('textarea[name="routeItems"]').fill("测试城市 → 测试老街");
  await page.getByRole("button", { name: "创建目的地" }).click();
  await page.waitForURL(url => url.pathname.startsWith("/admin/destinations/") && url.searchParams.get("created") === "1");
  const createdDestinationId = new URL(page.url()).pathname.split("/").at(-1);
  const homeResponse = await page.goto(host + "/");
  assert(homeResponse?.status() === 200 && (await page.locator("body").innerText()).includes("新增目的地·端到端测试"), "Manually created destination was not shown on home page");
  await page.locator(".editorial-filter-types").getByRole("button", { name: "美食" }).waitFor();
  await page.goto(host + `/admin/destinations/${createdDestinationId}`);
  await page.getByText("预算设置 · SGD").click();
  assert((await page.locator("body").innerText()).includes("两人旅行总预算（SGD）"), "Configured currency was not applied to destination editor");
  const photoBuffer = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#628c91" } }).png().toBuffer();
  await page.locator('input[name="image"]').setInputFiles({ name: "journey.png", mimeType: "image/png", buffer: photoBuffer });
  await page.getByRole("button", { name: "保存封面照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photo") === "1");
  await page.goto(host + "/");
  const destinationCover = await page.locator(".editorial-destination").filter({ hasText: "新增目的地·端到端测试" }).locator("img").first().getAttribute("src");
  assert(/^\/api\/media\/[a-f0-9-]{36}$/.test(destinationCover ?? ""), "Web-uploaded destination cover not present on shared wishlist");
  const destinationCoverResponse = await page.request.get(host + destinationCover);
  assert(destinationCoverResponse.ok() && destinationCoverResponse.headers()["content-type"] === "image/webp", "Destination cover file not publicly readable");

  await page.goto(host + "/admin/places/new");
  await page.locator('input[name="name"]').fill("新增足迹·端到端测试");
  await page.locator('input[name="region"]').fill("自动化测试地区");
  await page.locator('select[name="group"]').selectOption("her");
  await page.locator('input[name="whenLabel"]').fill("2026 年春季");
  await page.locator('input[name="storyDate"]').fill("2026-03-18");
  await page.locator('textarea[name="storyContent"]').fill("第一次走进这个地方。新建地点时只留一份文字。");
  await page.locator(".place-create-form details summary").click();
  await page.locator('input[name="country"]').fill("测试国家");
  await page.locator('input[name="province"]').fill("测试省份");
  await page.locator('input[name="city"]').fill("测试城市");
  await page.locator('input[name="latitude"]').fill("31.2");
  await page.locator('input[name="longitude"]').fill("121.5");
  await page.getByRole("button", { name: "保存这个去过的地方" }).click();
  await page.waitForURL(url => url.pathname.startsWith("/admin/places/") && url.searchParams.get("created") === "1");
  const createdPlaceId = new URL(page.url()).pathname.split("/").at(-1);
  assert((await page.locator(".place-note-form").innerText()).includes("关于新增足迹·端到端测试的记录"),
    "New place did not present the single note editor");
  assert(await prisma.travelMemory.count({ where: { placeId: createdPlaceId, planId: null } }) === 1,
    "Initial note must not require a travel plan");
  await verifyPhotoUpload({ page, host, placeId: createdPlaceId, prisma });
  await page.goto(host + "/visited");
  const visitedText = await page.locator("body").innerText();
  assert(visitedText.includes("新增足迹·端到端测试") && visitedText.includes("旅行者乙单独去过"), "Manually created place or custom member label was not shown");
  const placeCover = await page.locator(".atlas-photo-entry").filter({ hasText: "新增足迹·端到端测试" }).locator(".atlas-photo-frame img").getAttribute("src");
  assert((await page.locator(".atlas-place-stories").first().count()) > 0, "The visit story is not accessible from the public place card");
  assert(/^\/api\/media\/[a-f0-9-]{36}$/.test(placeCover ?? ""), "Web-uploaded visited photo not shown in shared archive");
  const placeCoverResponse = await page.request.get(host + placeCover);
  assert(placeCoverResponse.ok() && placeCoverResponse.headers()["content-type"] === "image/webp", "Visited cover file not publicly readable");

  await page.goto(host + "/admin/destinations/test-island");
  await page.locator('input[name="title"]').fill("虚构岛屿·端到端测试");
  await page.getByRole("button", { name: "保存目的地修改" }).click();
  await page.waitForURL("**/admin/destinations/test-island?saved=1");
  const dest = await page.goto(host + "/destinations/test-island");
  assert(dest?.status() === 200 && (await page.locator("body").innerText()).includes("虚构岛屿·端到端测试"), "Destination save failed");

  const removedFlightPage = await page.goto(host + "/admin/flights");
  assert(removedFlightPage?.status() === 404, "Removed flight management page should no longer be available");

  await page.goto(host + "/admin/places/test-town");
  await page.locator(".place-more-options summary").click();
  await page.locator('input[name="whenLabel"]').fill("示例小镇·测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/test-town?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("示例小镇·测试"), "Place save failed");

  await page.goto(host + "/admin/timeline");
  await page.locator('input[name="date"]').fill("2026.03");
  await page.locator('input[name="year"]').fill("2026");

  await page.goto(host + "/admin/plans/new");
  await page.locator('input[name="title"]').fill("日本七日游·旅行计划测试");
  await page.locator('select[name="destinationId"]').selectOption(createdDestinationId);
  await page.locator('input[name="startDate"]').fill("2026-12-01");
  await page.locator('input[name="endDate"]').fill("2026-12-07");
  await page.locator('select[name="status"]').selectOption("PLANNED");
  await page.locator('input[name="plannedBudget"]').fill("5000");
  await page.locator('select[name="currency"]').selectOption("SGD");
  await page.locator('textarea[name="notes"]').fill("由两个人共同维护的测试旅行计划。");
  await page.getByRole("button", { name: "创建旅行计划" }).click();
  try {
    await page.waitForURL(url => url.pathname.startsWith("/admin/plans/") && url.searchParams.get("created") === "1", { timeout: 12000 });
  } catch (error) {
    console.error("PLAN_CREATE_DEBUG:", page.url(), (await page.locator("body").innerText()).slice(-1600));
    throw error;
  }
  const createdPlanId = new URL(page.url()).pathname.split("/").at(-1);
  assert((await page.locator("body").innerText()).includes("日本七日游·旅行计划测试"), "Travel plan was not created");

  // 验证四类简单花费、SGD 小数精度、预算余额和删除后的重新汇总。
  async function recordExpense(category, amount, date, note) {
    await page.goto(host + `/admin/plans/${createdPlanId}`);
    const form = page.locator(".expense-form");
    await form.locator('select[name="category"]').selectOption(category);
    await form.locator('input[name="amount"]').fill(amount);
    if (date) await form.locator('input[name="spentAt"]').fill(date);
    if (note) await form.locator('input[name="description"]').fill(note);
    await form.getByRole("button", { name: "记录这笔费用" }).click();
    await page.waitForURL(url => url.searchParams.get("expenseSaved") === "1");
  }
  await recordExpense("TRANSPORT", "1250.50", "2026-11-20", "当地交通");
  await recordExpense("ACCOMMODATION", "800", "2026-12-01", "京都住宿");
  await recordExpense("FOOD", "250.25", "2026-12-03", "沿途餐饮");
  await recordExpense("OTHER", "100", "", "旅行杂项");
  const expenseRows = await prisma.expense.findMany({ where: { planId: createdPlanId } });
  assert(expenseRows.length === 4 && expenseRows.reduce((sum, item) => sum + item.amountMinor, 0) === 240075,
    "Four expense categories or currency minor-unit storage failed");
  assert(new Set(expenseRows.map(item => item.category)).size === 4, "Expense categories were not stored as the four fixed options");
  const expenseSummary = await page.locator(".expense-overview").innerText();
  assert(expenseSummary.includes("2,400.75") && expenseSummary.includes("2,599.25"),
    "Actual expense total or remaining travel budget was not calculated correctly");
  assert(await page.locator('select[name="currency"]').count() === 0
    && await page.locator('#plan-overview input[type="hidden"][name="currency"]').inputValue() === "SGD",
  "Travel currency was not locked after expenses were added");
  const planForm = page.locator("form.admin-form").first();
  await planForm.locator('input[type="hidden"][name="currency"]').evaluate(input => { input.value = "JPY"; });
  await planForm.getByRole("button", { name: "保存旅行计划" }).click();
  await planForm.getByRole("alert").waitFor();
  assert((await planForm.innerText()).includes("不能更改币种"), "Server accepted a currency change after expenses existed");
  assert((await page.locator(".expense-category-grid").innerText()).includes("1,250.50"),
    "Expense category breakdown was not displayed");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".expense-record").filter({ hasText: "其它" }).getByRole("button", { name: "删除" }).click();
  await page.waitForURL(url => url.searchParams.get("expenseDeleted") === "1");
  const remainingExpenses = await prisma.expense.findMany({ where: { planId: createdPlanId } });
  assert(remainingExpenses.length === 3 && remainingExpenses.reduce((sum, item) => sum + item.amountMinor, 0) === 230075,
    "Deleting an expense did not update the stored expense set");
  const updatedExpenseSummary = await page.locator(".expense-overview").innerText();
  assert(updatedExpenseSummary.includes("2,300.75") && updatedExpenseSummary.includes("2,699.25"),
    "Deleting an expense did not recalculate the trip budget balance");

  // 旅行计划不再管理日记，地点仅允许一份文字，照片逐张上传并显示进度。
  assert(await page.locator(".place-note-form").count() === 0, "Travel plan exposed a duplicate place note");
  await page.goto(host + "/admin/places/test-town");
  const memoryForm = page.locator(".place-note-form");
  await memoryForm.locator('input[name="happenedAt"]').fill("2026-12-01");
  await memoryForm.locator('textarea[name="content"]').fill("抵达京都的第一天。傍晚抵达后，在小镇街道慢慢散步。");
  await memoryForm.getByRole("button", { name: "保存旅行文字" }).click();
  await page.waitForURL(url => url.searchParams.get("storySaved") === "1");
  const createdMemoryId = (await prisma.travelMemory.findUnique({ where: { placeId: "test-town" } }))?.id;
  assert(createdMemoryId, "Place note was not created");
  const secondPhoto = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#a06485" } }).png().toBuffer();
  await page.locator('.photo-upload input[type="file"]').setInputFiles([
    { name: "first-moment.png", mimeType: "image/png", buffer: photoBuffer },
    { name: "second-moment.png", mimeType: "image/png", buffer: secondPhoto },
  ]);
  await page.getByRole("button", { name: "开始上传照片" }).click();
  await page.getByText("已上传 2 张照片。").waitFor({ timeout: 45000 });
  await page.locator(".place-gallery-grid .memory-admin-photo").last().waitFor({ timeout: 15000 });
  const savedMemory = await prisma.travelMemory.findUnique({
    where: { id: createdMemoryId }, include: { photos: { include: { mediaAsset: true } } },
  });
  assert(savedMemory?.placeId === "test-town" && savedMemory.planId === null && savedMemory.photos.length === 2,
    "Place note/photo gallery was not saved");
  assert(savedMemory.photos.every(photo => photo.mediaAsset?.status === "PUBLIC" && photo.mediaAsset.mimeType === "image/webp"),
    "Photo uploads were not converted to public WebP");
  assert(await prisma.travelMemory.count({ where: { placeId: "test-town" } }) === 1,
    "More than one text entry was created for the same place");

  const memoriesPage = await page.goto(host + "/memories");
  assert(memoriesPage?.status() === 200 && (await page.locator(".memory-story").filter({ hasText: "抵达京都的第一天" }).innerText()).includes("抵达京都的第一天"),
    "Public travel memory archive did not display the saved diary");
  assert((await page.locator(".memory-story").filter({ hasText: "抵达京都的第一天" }).locator(".memory-story-meta").innerText()).includes("示例小镇"),
    "Travel story did not link to its visited place");
  await page.goto(host + "/visited");
  const storyCard = page.locator("#place-test-town");
  await storyCard.locator(".atlas-place-stories summary").click();
  assert((await storyCard.innerText()).includes("抵达京都的第一天"),
    "Travel story and album are not available directly inside the visited place");
  assert((await page.locator(".atlas-timeline").innerText()).includes("示例小镇"),
    "Dated place note did not appear in the visited timeline");
  await page.goto(host + "/memories");
  const memoryPhotoUrl = await page.locator(".memory-story").filter({ hasText: "抵达京都的第一天" }).locator(".memory-story-photos img").first().getAttribute("src");
  assert(/^\/api\/media\/[a-f0-9-]{36}$/.test(memoryPhotoUrl ?? ""), "Travel memory photo URL is invalid");
  const memoryPhotoResponse = await page.request.get(host + memoryPhotoUrl);
  assert(memoryPhotoResponse.ok() && memoryPhotoResponse.headers()["content-type"] === "image/webp",
    "Travel memory photo was not publicly readable");

  await page.goto(host + "/admin/places/test-town");
  const editMemoryForm = page.locator(".place-note-form");
  await editMemoryForm.locator('textarea[name="content"]').fill("抵达京都的第一天·修订版。和对象一起慢慢走过街道。");
  await editMemoryForm.getByRole("button", { name: "保存旅行文字" }).click();
  await page.waitForURL(url => url.searchParams.get("storySaved") === "1");
  assert((await prisma.travelMemory.findUnique({ where: { id: createdMemoryId } }))?.content.includes("修订版"),
    "Single place note edit was not saved");

  const deletedPhoto = savedMemory.photos[1];
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".memory-admin-photo").last().getByRole("button", { name: "移除照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photoDeleted") === "1");
  assert(await prisma.travelPhoto.count({ where: { memoryId: createdMemoryId } }) === 1,
    "Deleting a memory photo did not remove its metadata");
  assert(deletedPhoto.mediaAssetId
    && !(await prisma.mediaAsset.findUnique({ where: { id: deletedPhoto.mediaAssetId } })),
  "Deleting a memory photo did not remove its media asset");
  await page.goto(host + "/memories");
  assert((await page.locator(".memory-story").filter({ hasText: "抵达京都的第一天·修订版" }).locator(".memory-story-photos img").count()) === 1,
    "Public story archive did not reflect the updated photo gallery");

  // 再次上传只能追加照片，不能生成第二份文字。删图也不能删除那份文字。
  await page.goto(host + "/admin/places/test-town");
  const thirdPhoto = await sharp({ create: { width: 65, height: 65, channels: 3, background: "#3c6570" } }).png().toBuffer();
  await page.locator('.photo-upload input[type="file"]').setInputFiles({
    name: "third-memory.png", mimeType: "image/png", buffer: thirdPhoto,
  });
  await page.getByRole("button", { name: "开始上传照片" }).click();
  await page.getByText("已上传 1 张照片。").waitFor({ timeout: 45000 });
  const lastAdded = (await prisma.travelMemory.findUniqueOrThrow({
    where: { id: createdMemoryId }, include: { photos: true },
  })).photos.find(photo => !savedMemory.photos.some(previous => previous.id === photo.id));
  assert(lastAdded?.mediaAssetId, "Newly appended gallery photo is missing");
  assert(await prisma.travelMemory.count({ where: { placeId: "test-town" } }) === 1,
    "Adding photos created a second place note");
  assert((await prisma.travelPhoto.count({ where: { memoryId: createdMemoryId } })) === 2,
    "Appending a photo failed");
  await page.locator(".place-gallery-grid .memory-admin-photo").nth(1).waitFor({ timeout: 15000 });
  assert((await page.locator(".place-gallery-grid .memory-admin-photo").count()) === 2,
    "Gallery did not reflect photo append");
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".memory-admin-photo").last().getByRole("button", { name: "移除照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photoDeleted") === "1");
  assert(await prisma.travelPhoto.count({ where: { memoryId: createdMemoryId } }) === 1
    && !(await prisma.mediaAsset.findUnique({ where: { id: lastAdded.mediaAssetId } })),
  "Removing an appended photo must preserve the place note but clean unused media");

  await page.goto(host + `/admin/plans/${createdPlanId}`);
  const guideForm = page.locator(".plan-guide-form");
  await guideForm.locator('input[name="title"]').fill("日本七日完整旅行手册");
  await guideForm.locator('input[name="url"]').fill("https://guides.example.com/japan/");
  await guideForm.locator('input[name="coverImage"]').fill("https://images.example.com/japan-cover.webp");
  await guideForm.locator('textarea[name="description"]').fill("由 AI 生成并通过 Stack-Nest CLI 部署的完整旅行攻略。");
  await guideForm.getByRole("button", { name: "添加攻略入口" }).click();
  await page.waitForURL(url => url.searchParams.get("guideSaved") === "1" && Boolean(url.searchParams.get("guideId")));
  const fullGuideId = new URL(page.url()).searchParams.get("guideId");
  const fullGuide = page.locator('a[href="https://guides.example.com/japan/"]');
  assert(await fullGuide.count() === 1, "Full-trip external HTML guide was not saved");
  assert(await fullGuide.getAttribute("target") === "_blank" && (await fullGuide.getAttribute("rel") ?? "").includes("noopener"),
    "External HTML guide does not open safely in a new tab");

  await page.locator(".plan-guides-section summary").click();
  const dailyForm = page.locator(".plan-guide-form");
  await dailyForm.locator('input[name="title"]').fill("第二天·东京漫游");
  await dailyForm.locator('input[name="dayDate"]').fill("2026-12-02");
  await dailyForm.locator('input[name="url"]').fill("javascript:alert(1)");
  await dailyForm.getByRole("button", { name: "添加攻略入口" }).click();
  await dailyForm.getByRole("alert").waitFor();
  assert((await dailyForm.innerText()).includes("HTTP 或 HTTPS"), "Unsafe javascript: guide URL was not rejected");
  await page.reload();
  await page.locator(".plan-guides-section summary").click();
  const validDailyForm = page.locator(".plan-guide-form");
  await validDailyForm.locator('input[name="title"]').fill("第二天·东京漫游");
  await validDailyForm.locator('input[name="dayDate"]').fill("2026-12-02");
  await validDailyForm.locator('input[name="url"]').fill("https://guides.example.com/japan/day-02/");
  await validDailyForm.getByRole("button", { name: "添加攻略入口" }).click();
  try {
    await page.waitForURL(url => Boolean(url.searchParams.get("guideId")) && url.searchParams.get("guideId") !== fullGuideId, { timeout: 12000 });
  } catch (error) {
    console.error("DAILY_GUIDE_DEBUG:", page.url(), (await dailyForm.innerText()).slice(-1000), serverErrors.slice(-1800));
    throw error;
  }
  await page.locator(".plan-guide-list").getByText("第二天·东京漫游").waitFor({ timeout: 10000 });
  assert((await page.locator(".plan-guide-list").innerText()).includes("第二天·东京漫游"), "Daily guide URL was not saved");

  await page.locator(".plan-guide-actions a").filter({ hasText: "编辑入口" }).first().click();
  await page.locator('.plan-guide-form input[name="title"]').fill("日本七日完整旅行手册·修订版");
  await page.locator('.plan-guide-form input[name="url"]').fill("https://guides.example.com/japan/revised/");
  await page.locator(".plan-guide-form").getByRole("button", { name: "保存攻略入口" }).click();
  await page.waitForURL(url => url.searchParams.get("guideSaved") === "1" && url.searchParams.get("guideId") === fullGuideId);
  assert((await page.locator(".plan-guide-list").innerText()).includes("日本七日完整旅行手册·修订版"), "Guide link edit was not saved");
  await page.goto(host + "/admin/plans");
  assert((await page.locator("body").innerText()).includes("2 份 HTML 攻略"), "Plan list does not summarize its external guides");

  await page.goto(host + "/admin/timeline");
  await page.locator('input[name="date"]').fill("2026.03");
  await page.locator('input[name="year"]').fill("2026");
  await page.locator('select[name="group"]').selectOption("both");
  await page.locator('input[name="title"]').fill("一起出发的春天·端到端测试");
  await page.locator('textarea[name="note"]').fill("把新增加的足迹关联到这段旅行。");
  await page.locator('input[name="placeIds"][value="test-town"]').check();
  await page.getByRole("button", { name: "新增时间记录" }).click();
  await page.waitForURL("**/admin/timeline?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("一起出发的春天·端到端测试"), "Timeline event was not published");
  assert((await page.locator(".atlas-entry-links").allInnerTexts()).some(text => text.includes("示例小镇")), "Timeline event did not link to its visited place");

  const usersPage = await page.goto(host + "/admin/users");
  assert(usersPage?.status() === 200, "Administrator cannot manage the two private accounts");
  await page.locator('input[name="username"]').fill("partner_test");
  await page.locator('input[name="displayName"]').fill("测试编辑者");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.locator('input[name="confirm"]').fill(partnerPass);
  await page.getByRole("button", { name: "创建编辑账号" }).click();
  await page.waitForURL("**/admin/users?created=1");
  assert((await page.getByText("测试编辑者").count()) > 0, "Partner account was not created");
  assert((await prisma.user.count()) === 2, "Partner account was not added as the second shared-site user");
  assert((await page.locator('input[name="username"]').count()) === 0
    && (await page.locator("body").innerText()).includes("两位成员已就位"),
  "Account management did not enforce the two-member limit");

  await page.getByRole("button", { name: "退出" }).click();
  await page.waitForURL("**/login");
  await page.locator('input[name="username"]').fill("partner_test");
  await page.locator('input[name="password"]').fill(partnerPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  const sharedPlanPage = await page.goto(host + `/admin/plans/${createdPlanId}`);
  assert(sharedPlanPage?.status() === 200 && (await page.locator(".plan-guide-list").innerText()).includes("日本七日完整旅行手册·修订版"),
    "Partner cannot access the shared plan and its AI guide links");
  assert((await page.locator(".expense-overview").innerText()).includes("2,300.75")
    && (await page.locator(".expense-record-list").innerText()).includes("当地交通"),
  "Partner cannot view the shared travel expenses");
  const sharedPlace = await page.goto(host + "/admin/places/test-town");
  assert(sharedPlace?.status() === 200 && (await page.locator(".place-note-form textarea[name='content']").inputValue()).includes("抵达京都的第一天·修订版"),
    "Partner cannot access the shared place stories and photos");
  await page.goto(host + `/admin/plans/${createdPlanId}`);
  await page.locator('textarea[name="notes"]').fill("由对象账号共同补充的旅行备注。");
  await page.getByRole("button", { name: "保存旅行计划" }).click();
  await page.waitForURL(url => url.searchParams.get("saved") === "1");
  assert((await prisma.travelPlan.findUnique({ where: { id: createdPlanId } }))?.notes === "由对象账号共同补充的旅行备注。",
    "Partner could not update shared travel plan data");

  const editorPage = await page.goto(host + "/admin/places/test-town");
  assert(editorPage?.status() === 200, "Partner cannot edit the shared travel archive");
  await page.locator(".place-more-options summary").click();
  await page.locator('input[name="whenLabel"]').fill("示例小镇·两人编辑测试");
  await page.getByRole("button", { name: "保存足迹修改" }).click();
  await page.waitForURL("**/admin/places/test-town?saved=1");
  await page.goto(host + "/visited");
  assert((await page.locator("body").innerText()).includes("示例小镇·两人编辑测试"), "Partner edit did not appear in shared archive");
  const restrictedUsers = await page.goto(host + "/admin/users");
  assert(restrictedUsers?.status() === 404, "Editor accessed administrator account management");
  const restrictedSettings = await page.goto(host + "/admin/settings");
  assert(restrictedSettings?.status() === 404, "Editor accessed site settings");
  const restrictedRestore = await page.goto(host + "/admin/restore");
  assert(restrictedRestore?.status() === 404, "Editor accessed backup restore");
  const restrictedExport = await page.request.post(host + "/api/admin/backup", { headers: { Origin: host } });
  assert(restrictedExport.status() === 403, "Editor exported a full-site backup");

  await page.goto(host + "/admin");
  await page.getByRole("button", { name: "退出" }).click();
  await page.waitForURL("**/login");
  await page.locator('input[name="username"]').fill("e2e_owner");
  await page.locator('input[name="password"]').fill(pass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");

  // 私密模式同时保护页面和图片，但不影响已授权的 CLI Token。
  await page.goto(host + "/admin/settings");
  await page.locator('select[name="visibility"]').selectOption("PRIVATE");
  await page.getByRole("button", { name: "保存站点设置" }).click();
  await page.waitForURL("**/admin/settings?saved=1");
  assert((await prisma.appSetting.findUnique({ where: { key: "visibility" } }))?.value === "PRIVATE", "Private visibility setting was not persisted");

  const privateGuest = await browser.newPage();
  for (const path of ["/", "/visited", "/memories", "/destinations/test-island"]) {
    await privateGuest.goto(host + path);
    const current = new URL(privateGuest.url());
    assert(current.pathname === "/login" && current.searchParams.get("next") === path, `Anonymous access to ${path} was not redirected safely`);
  }
  const anonymousUpload = await privateGuest.request.get(host + placeCover);
  assert(anonymousUpload.status() === 404 && (anonymousUpload.headers()["cache-control"] ?? "").includes("no-store"),
    "Anonymous access to uploaded images was not blocked without caching");
  const anonymousMemoryPhoto = await privateGuest.request.get(host + memoryPhotoUrl);
  assert(anonymousMemoryPhoto.status() === 404 && (anonymousMemoryPhoto.headers()["cache-control"] ?? "").includes("no-store"),
    "Anonymous access to travel diary photos was not blocked without caching");
  const anonymousLegacy = await privateGuest.request.get(host + "/api/legacy-media/images/private-test.jpg");
  assert(anonymousLegacy.status() === 404 && (anonymousLegacy.headers()["cache-control"] ?? "").includes("no-store"),
    "Anonymous access to legacy images was not blocked without caching");
  const authorizedUpload = await page.request.get(host + placeCover);
  assert(authorizedUpload.ok() && (authorizedUpload.headers()["cache-control"] ?? "").includes("private"),
    "Authenticated members could not read private images with private cache headers");
  const authorizedMemoryPhoto = await page.request.get(host + memoryPhotoUrl);
  assert(authorizedMemoryPhoto.ok() && (authorizedMemoryPhoto.headers()["cache-control"] ?? "").includes("private"),
    "Authenticated members could not read private travel diary photos");
  const cliReadWhilePrivate = await page.request.get(host + "/api/v1/visits", {
    headers: { Authorization: `Bearer ${issuedToken}` },
  });
  assert(cliReadWhilePrivate.ok(), "Private site visibility unexpectedly blocked an authorized CLI token");

  await privateGuest.goto(host + "/visited");
  await privateGuest.locator('input[name="username"]').fill("partner_test");
  await privateGuest.locator('input[name="password"]').fill(partnerPass);
  await privateGuest.getByRole("button", { name: "登录私人后台" }).click();
  await privateGuest.waitForURL("**/visited");
  const memberPage = await privateGuest.goto(host + "/destinations/test-island");
  assert(memberPage?.status() === 200 && (await privateGuest.locator("body").innerText()).includes("虚构岛屿·端到端测试"),
    "A logged-in partner could not return to and browse the requested private page");
  const partnerUpload = await privateGuest.request.get(host + placeCover);
  assert(partnerUpload.ok() && (partnerUpload.headers()["cache-control"] ?? "").includes("private"),
    "The second member could not read private travel photos");

  await page.goto(host + "/admin/settings");
  await page.locator('select[name="visibility"]').selectOption("PUBLIC");
  await page.getByRole("button", { name: "保存站点设置" }).click();
  await page.waitForURL("**/admin/settings?saved=1");
  const publicGuest = await browser.newPage();
  const publicVisited = await publicGuest.goto(host + "/visited");
  assert(publicVisited?.status() === 200 && new URL(publicGuest.url()).pathname === "/visited",
    "Switching back to public did not restore anonymous page access");
  const publicMemories = await publicGuest.goto(host + "/memories");
  assert(publicMemories?.status() === 200 && (await publicGuest.locator(".memory-story").filter({ hasText: "抵达京都的第一天·修订版" }).innerText()).includes("抵达京都的第一天·修订版"),
    "Switching back to public did not restore travel diary access");
  const publicUpload = await publicGuest.request.get(host + placeCover);
  assert(publicUpload.ok() && (publicUpload.headers()["cache-control"] ?? "").includes("max-age=0"),
    "Public images must be readable with revalidation-safe cache headers");
  const publicMemoryPhoto = await publicGuest.request.get(host + memoryPhotoUrl);
  assert(publicMemoryPhoto.ok() && (publicMemoryPhoto.headers()["cache-control"] ?? "").includes("max-age=0"),
    "Public travel diary photos must be readable with revalidation-safe cache headers");
  await publicGuest.close();
  await privateGuest.close();

  await verifyRecordLoops({ page, browser, host, prisma, planId: createdPlanId, destinationId: createdDestinationId, memoryId: createdMemoryId, photoBuffer });

  // 旧版未选地点的故事应有明确整理入口，不因换版被遗忘。
  const orphan = await prisma.travelMemory.create({ data: { title: "待归类的老故事", content: "保留旧版记录", planId: createdPlanId } });
  await page.goto(host + "/admin/places");
  const assignForm = page.locator(".place-assign-row").filter({ hasText: "待归类的老故事" });
  await assignForm.locator('select[name="placeId"]').selectOption("test-town");
  await assignForm.getByRole("button", { name: "归入地点" }).click();
  await page.waitForURL(url => url.searchParams.get("storySaved") === "1");
  assert(!(await prisma.travelMemory.findUnique({ where: { id: orphan.id } }))
    && (await prisma.travelMemory.findUnique({ where: { placeId: "test-town" } }))?.content.includes("待归类的老故事"),
    "Legacy story content was not merged into the existing single place note");

  // 模拟以前附属于计划的故事及照片，删除计划后必须仍在地点相册中。
  const originalStory = await prisma.travelMemory.findFirstOrThrow({
    where: { placeId: createdPlaceId }, include: { photos: true },
  });
  await prisma.travelMemory.update({ where: { id: originalStory.id }, data: { planId: createdPlanId } });
  await prisma.travelPhoto.updateMany({ where: { memoryId: originalStory.id }, data: { planId: createdPlanId } });
  await page.goto(host + `/admin/plans/${createdPlanId}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除旅行计划" }).click();
  await page.waitForURL("**/admin/plans?deleted=1");
  const preservedStory = await prisma.travelMemory.findUnique({ where: { id: originalStory.id }, include: { photos: true } });
  assert(preservedStory?.placeId && preservedStory.planId === null && preservedStory.photos.length === 1
    && preservedStory.photos[0].planId === null, "Deleting a plan incorrectly deleted or retained an old story association");
  assert((await page.request.get(host + placeCover)).ok(), "Plan deletion incorrectly deleted a place photo");

  // 地点封面引用相册首图时，删掉首图需要自动更新封面，不能留下死链接。
  await page.goto(host + `/admin/places/${createdPlaceId}`);
  page.once("dialog", dialog => dialog.accept());
  await page.locator(".memory-admin-photo").first().getByRole("button", { name: "移除照片" }).click();
  await page.waitForURL(url => url.searchParams.get("photoDeleted") === "1");
  assert((await prisma.visitedPlace.findUnique({ where: { id: createdPlaceId } }))?.image === "images/place-placeholder.svg",
    "Deleting the gallery cover photo did not reset the place cover");
  assert((await page.request.get(host + placeCover)).status() === 404,
    "Removed gallery cover photo is still publicly accessible");

  // Both people can log in independently; changing a password revokes only that account's sessions.
  const secondaryContext = await browser.newContext();
  const secondaryPage = await secondaryContext.newPage();
  await secondaryPage.goto(host + "/login");
  await secondaryPage.locator('input[name="username"]').fill("e2e_owner");
  await secondaryPage.locator('input[name="password"]').fill(pass);
  await secondaryPage.getByRole("button", { name: "登录私人后台" }).click();
  await secondaryPage.waitForURL("**/admin");
  const nextPass = "Changed-only-" + randomBytes(12).toString("hex");
  await page.goto(host + "/admin/account");
  await page.locator('input[name="currentPassword"]').fill(pass);
  await page.locator('input[name="newPassword"]').fill(nextPass);
  await page.locator('input[name="confirmPassword"]').fill(nextPass);
  await page.getByRole("button", { name: "更新密码并退出所有设备" }).click();
  await page.waitForURL("**/login?changed=1");
  await secondaryPage.goto(host + "/admin");
  assert(secondaryPage.url().includes("/login"), "Password change did not revoke the other device session");
  await secondaryContext.close();
  await page.locator('input[name="username"]').fill("e2e_owner");
  await page.locator('input[name="password"]').fill(nextPass);
  await page.getByRole("button", { name: "登录私人后台" }).click();
  await page.waitForURL("**/admin");
  await page.goto(host + "/admin");
  await page.getByRole("button", { name: "退出" }).click();
  await page.waitForURL("**/login");
  await page.goto(host + "/admin");
  assert(page.url().endsWith("/login"), "Logout did not revoke session");

  console.log("E2E_PASS: one note per place, per-photo upload progress, network retry, image validation, shared couple accounts, public/private permissions, plans, expenses, gallery photo deletion, archive, legacy note merge, plan deletion preserving album, HTML guide links, session revocation and logout");
}

try {
  await run();
} catch (error) {
  console.error("E2E_FAIL:", error instanceof Error ? error.stack : String(error));
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
