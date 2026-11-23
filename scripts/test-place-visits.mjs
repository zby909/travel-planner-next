import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { verifyPhotoEditorial } from "./test-photo-editorial.mjs";

// 通过编辑器添加一次到访，返回独立记录 ID。
async function addVisit(page, url, group, date, title, journal) {
  await page.goto(url);
  await page.getByRole("link", { name: "＋ 添加一次到访" }).click();
  await page.waitForURL(location => location.searchParams.get("visit") === "new");
  const form = page.locator(".place-note-form");
  await form.locator('[name="group"]').selectOption(group);
  await form.locator('[name="happenedAt"]').fill(date);
  await form.locator('[name="title"]').fill(title);
  await form.locator('[name="content"]').fill(journal);
  await form.getByRole("button", { name: "保存到访记录" }).click();
  await page.waitForURL(location => location.searchParams.get("noteSaved") === "1");
  return new URL(page.url()).searchParams.get("visit");
}

// 验证先后各自到访与重游、独立相册、共享配额和移动端浏览。
export async function verifyPlaceVisits({ page, browser, host, prisma, placeId, firstVisitId, photoBuffer }) {
  const editUrl = `${host}/admin/places/${placeId}`;
  const publicUrl = `${host}/visited/${placeId}`;
  const solo = await addVisit(page, editUrl, "mine", "2024-07-13", "独自走过旧街", "七月的旧街还有风。\n一路走到码头。");
  const together = await addVisit(page, editUrl, "both", "2026-10-10", "一起回到这里", "这次两个人都去了同一家旧书店。");
  assert.ok(solo && together && new Set([firstVisitId, solo, together]).size === 3);
  assert.equal(await prisma.travelMemory.count({ where: { placeId } }), 3);

  // 上传到明确的一次到访，并返回请求结果，便于检查计数与容量边界。
  async function upload(visitId, requestId = randomUUID()) {
    return page.request.post(`${host}/api/admin/place-photos`, {
      headers: { Origin: host }, multipart: {
        placeId, visitId, requestId, image: { name: "visit.png", mimeType: "image/png", buffer: photoBuffer },
      },
    });
  }

  const firstPhotoId = randomUUID();
  assert.equal((await upload(firstVisitId, firstPhotoId)).status(), 201);
  assert.equal((await upload(together, firstPhotoId)).status(), 400, "Retry ID was accepted for a different visit");
  const togetherPhotoId = randomUUID();
  assert.equal((await upload(together, togetherPhotoId)).status(), 201);
  assert.equal(await prisma.travelPhoto.count({ where: { memoryId: solo } }), 0);

  const firstAsset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: firstPhotoId } });
  await prisma.mediaAsset.update({ where: { id: firstPhotoId }, data: { byteSize: 24 * 1024 ** 2 } });
  const rejectedId = randomUUID();
  const full = await upload(solo, rejectedId);
  assert.equal(full.status(), 400);
  assert.match((await full.json()).error, /24 MiB/, "Photos in other visits must count against the size limit");
  assert.equal(await prisma.mediaAsset.findUnique({ where: { id: rejectedId } }), null);
  assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${rejectedId}.webp`)), false);
  await prisma.mediaAsset.update({ where: { id: firstPhotoId }, data: { byteSize: firstAsset.byteSize } });

  const fillers = Array.from({ length: 117 }, (_, index) => ({ id: randomUUID(), memoryId: solo, filePath: "", sortOrder: index }));
  await prisma.travelPhoto.createMany({ data: fillers });
  const attempted = [randomUUID(), randomUUID()];
  const responses = await Promise.all([upload(firstVisitId, attempted[0]), upload(together, attempted[1])]);
  assert.deepEqual(responses.map(response => response.status()).sort(), [201, 400], "Concurrent uploads exceeded the last slot");
  assert.equal(await prisma.travelPhoto.count({ where: { memory: { placeId } } }), 120);
  await prisma.travelPhoto.deleteMany({ where: { id: { in: fillers.map(photo => photo.id) } } });

  const guest = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    assert.equal((await guest.goto(publicUrl)).status(), 200);
    const articles = guest.locator('article[id^="visit-"]');
    assert.deepEqual(await articles.evaluateAll(elements => elements.map(element => element.id)), [
      `visit-${solo}`, `visit-${firstVisitId}`, `visit-${together}`,
    ]);
    assert.match(await guest.locator(`#visit-${firstVisitId}`).innerText(), /第一次走进这个地方/);
    assert.equal(await guest.locator(`#visit-${firstVisitId} img[src="/api/media/${firstPhotoId}?w=960"]`).count(), 1);
    assert.equal(await guest.locator(`#visit-${together} img[src="/api/media/${togetherPhotoId}?w=960"]`).count(), 1);
    assert.equal(await guest.locator(`#visit-${solo} img`).count(), 0);

    const link = guest.getByRole("navigation", { name: "按到访日期跳转" }).locator(`a[href="#visit-${together}"]`);
    await link.click();
    const trigger = guest.locator(`#visit-${together}`).getByRole("button", { name: /放大查看/ }).first();
    await trigger.focus();
    await trigger.press("Enter");
    await guest.getByRole("dialog").waitFor();
    await guest.keyboard.press("Escape");
    await guest.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate(button => button === document.activeElement), true, "Lightbox did not return focus");

    const visualDir = process.env.TRAVEL_E2E_VISUAL_DIR;
    if (visualDir) {
      await mkdir(visualDir, { recursive: true });
      await guest.goto(publicUrl);
      await guest.screenshot({ path: join(visualDir, "place-desktop.png"), fullPage: true });
    }
    await guest.setViewportSize({ width: 390, height: 844 });
    await guest.goto(publicUrl);
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Place timeline overflows on mobile");
    if (visualDir) await guest.screenshot({ path: join(visualDir, "place-mobile.png"), fullPage: true });

    await guest.goto(`${host}/visited`);
    const search = guest.getByRole("search");
    await search.getByRole("searchbox").fill("自动化测试地区");
    await search.getByLabel("按同行人筛选").selectOption("mine");
    await search.getByRole("button", { name: "查找" }).click();
    await guest.waitForURL(location => location.searchParams.get("group") === "mine");
    assert.equal(await guest.locator(`.atlas-photo-entry[href="/visited/${placeId}"]`).count(), 1, "A place is not filterable by a past visitor");
    assert.equal(await guest.locator(`.atlas-timeline a[href="/visited/${placeId}#visit-${solo}"]`).count(), 1);
    await guest.locator("#footprint-map").scrollIntoViewIfNeeded();
    await guest.locator("#footprint-map canvas").first().waitFor({ timeout: 15000 });
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "Footprint directory overflows on mobile");
  } finally {
    await guest.close();
  }

  await verifyPhotoEditorial({ page, browser, host, prisma, placeId, firstVisitId, togetherVisitId: together });
  await page.goto(`${editUrl}?visit=${together}`);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除这次到访" }).click();
  await page.waitForURL(location => location.searchParams.get("visitDeleted") === "1");
  assert.ok((await prisma.travelMemory.findUniqueOrThrow({ where: { id: together } })).deletedAt);
  assert.ok(await prisma.travelMemory.findUnique({ where: { id: firstVisitId } }));
  assert.ok(await prisma.mediaAsset.findUnique({ where: { id: firstPhotoId } }));
  assert.ok(await prisma.mediaAsset.findUnique({ where: { id: togetherPhotoId } }));
  const deletedGuest = await browser.newPage();
  await deletedGuest.goto(publicUrl);
  assert.equal(await deletedGuest.locator(`#visit-${together}`).count(), 0);
  assert.equal((await deletedGuest.request.get(`${host}/api/media/${togetherPhotoId}?w=320`)).status(), 404);
  await deletedGuest.close();
  await page.locator("#visit-trash summary").click();
  await page.locator("#visit-trash").getByRole("button", { name: "恢复到访" }).click();
  await page.waitForURL(location => location.searchParams.get("restored") === "1");
  assert.equal((await prisma.travelMemory.findUniqueOrThrow({ where: { id: together } })).deletedAt, null);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "删除这次到访" }).click();
  await page.waitForURL(location => location.searchParams.get("visitDeleted") === "1");
  await page.locator("#visit-trash summary").click();
  page.once("dialog", dialog => dialog.accept());
  await page.locator("#visit-trash").getByRole("button", { name: "彻底删除" }).click();
  await page.waitForURL(location => location.searchParams.get("purged") === "1");
  assert.equal(await prisma.travelMemory.findUnique({ where: { id: together } }), null);
  assert.equal(await prisma.mediaAsset.findUnique({ where: { id: togetherPhotoId } }), null);
  console.log("PLACE_VISITS_PASS: chronological journals, independent albums, quotas, trash restore and purge, keyboard lightbox and mobile layout");
}
