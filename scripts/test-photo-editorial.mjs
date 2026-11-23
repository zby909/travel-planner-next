import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

// 使用减少动态效果模式等待图片解码，得到完整而稳定的页面截图。
async function capture(page, path) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator("img").evaluateAll(images => Promise.all(images.map(image => {
    image.loading = "eager";
    return image.decode().catch(() => {});
  })));
  await page.screenshot({ path, fullPage: true, animations: "disabled" });
}

// 检查相册排序配文、首页精选、封面焦点以及共同编辑时的保护。
export async function verifyPhotoEditorial({ page, browser, host, prisma, placeId, firstVisitId, togetherVisitId }) {
  const edit = `${host}/admin/places/${placeId}?visit=${firstVisitId}`;
  const publicUrl = `${host}/visited/${placeId}`;
  const portrait = await sharp({ create: { width: 520, height: 900, channels: 3, background: "#879b69" } }).png().toBuffer();
  const landscape = await sharp({ create: { width: 1500, height: 650, channels: 3, background: "#927259" } }).png().toBuffer();
  const ids = [randomUUID(), randomUUID()];
  for (const [index, buffer] of [portrait, landscape].entries()) {
    const response = await page.request.post(`${host}/api/admin/place-photos`, {
      headers: { Origin: host }, multipart: { placeId, visitId: firstVisitId, requestId: ids[index],
        image: { name: "editorial.png", mimeType: "image/png", buffer } },
    });
    assert.equal(response.status(), 201, await response.text());
  }
  const small = await page.request.get(`${host}/api/media/${ids[1]}?w=320`);
  const smallMeta = await sharp(await small.body()).metadata();
  assert.equal(smallMeta.width, 320);
  assert.equal((await page.request.get(`${host}/api/media/${ids[1]}?w=9999`)).status(), 400);

  await page.goto(edit);
  const before = await prisma.travelPhoto.findMany({ where: { memoryId: firstVisitId }, orderBy: { sortOrder: "asc" } });
  const lastCard = page.locator(".memory-admin-photo").last();
  await lastCard.getByLabel("照片说明").fill("远山之外，留一点空白。\n宽幅画面保留完整构图。");
  await lastCard.getByLabel("首页精选").check();
  await lastCard.getByRole("button", { name: /上移/ }).click();
  await page.locator('.photo-upload input[type="file"]').setInputFiles({ name: "added.png", mimeType: "image/png", buffer: portrait });
  await page.getByRole("button", { name: "开始上传照片" }).click();
  await page.waitForFunction(count => document.querySelectorAll(".memory-admin-photo").length === count, before.length + 1);
  const edited = page.locator(".memory-admin-photo").filter({ has: page.locator(`img[src="/api/media/${ids[1]}?w=640"]`) });
  assert.match(await edited.getByLabel("照片说明").inputValue(), /远山之外/);
  assert.ok(await edited.getByLabel("首页精选").isChecked());
  await page.getByRole("button", { name: "保存相册整理" }).click();
  await page.getByText("顺序、说明和精选有未保存的修改").waitFor({ state: "hidden" });
  const selected = await prisma.travelPhoto.findUniqueOrThrow({ where: { mediaAssetId: ids[1] } });
  assert.equal(selected.isFeatured, true);
  assert.ok(selected.sortOrder < before.at(-1).sortOrder);

  const caption = page.locator(".memory-admin-photo").filter({ has: page.locator(`img[src="/api/media/${ids[0]}?w=640"]`) }).getByLabel("照片说明");
  await caption.fill("当前页面的配文草稿");
  await prisma.$transaction([
    prisma.travelPhoto.update({ where: { mediaAssetId: ids[0] }, data: { altText: "另一位成员保存的配文" } }),
    prisma.travelMemory.update({ where: { id: firstVisitId }, data: { albumRevision: { increment: 1 } } }),
  ]);
  await page.getByRole("button", { name: "保存相册整理" }).click();
  const reloadAlbum = page.getByRole("button", { name: "载入最新相册" });
  await reloadAlbum.waitFor();
  assert.equal(await caption.inputValue(), "当前页面的配文草稿");
  page.once("dialog", dialog => dialog.accept());
  await reloadAlbum.click();
  assert.equal(await caption.inputValue(), "另一位成员保存的配文");

  await page.goto(edit);
  const cropCard = page.locator(".memory-admin-photo").filter({ has: page.locator(`img[src="/api/media/${ids[1]}?w=640"]`) });
  await cropCard.locator("details summary").click();
  await cropCard.locator('input[name="coverX"]').fill("17");
  await cropCard.locator('input[name="coverY"]').fill("76");
  await cropCard.getByRole("button", { name: "设为封面", exact: true }).click();
  await page.waitForURL(location => location.searchParams.get("coverSaved") === "1");
  const place = await prisma.visitedPlace.findUniqueOrThrow({ where: { id: placeId } });
  assert.equal(place.coverX, 17); assert.equal(place.coverY, 76);

  const guest = await browser.newPage();
  try {
    await guest.goto(host);
    assert.equal(await guest.getByRole("complementary", { name: "成员快捷入口" }).count(), 0);
    assert.ok(await guest.getByRole("group", { name: "首页精选的照片相册" }).count());
    assert.match(await guest.locator("body").innerText(), /远山之外/);
    await guest.goto(publicUrl);
    const image = guest.locator(`img[src="/api/media/${ids[0]}?w=960"]`);
    assert.equal(await image.evaluate(node => Math.round(node.parentElement.getBoundingClientRect().height / node.parentElement.getBoundingClientRect().width * 100)), Math.round(900 / 520 * 100));
    assert.ok(await guest.locator('img[style*="17% 76%"]' ).count());
    await guest.setViewportSize({ width: 390, height: 844 });
    assert.ok(await guest.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    const folder = process.env.TRAVEL_E2E_VISUAL_DIR;
    if (folder) {
      await mkdir(folder, { recursive: true });
      await capture(guest, join(folder, "editorial-mobile.png"));
      await guest.goto(host);
      await capture(guest, join(folder, "home-mobile.png"));
      await guest.setViewportSize({ width: 1440, height: 1000 });
      await guest.goto(host);
      await capture(guest, join(folder, "home-desktop.png"));
    }
  } finally { await guest.close(); }

  await page.goto(edit);
  const note = page.locator(".place-note-form");
  await note.locator('[name="content"]').fill("暂存在本机的文字。");
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "恢复草稿" }).click();
  assert.equal(await note.locator('[name="content"]').inputValue(), "暂存在本机的文字。");

  const otherContext = await browser.newContext({ storageState: await page.context().storageState() });
  const other = await otherContext.newPage();
  await other.goto(edit);
  await other.locator('.place-note-form [name="content"]').fill("另一位成员先保存的版本。");
  await other.getByRole("button", { name: "保存到访记录" }).click();
  await other.waitForURL(location => location.searchParams.get("noteSaved") === "1");
  await page.getByRole("button", { name: "保存到访记录" }).click();
  await note.getByRole("alert").waitFor();
  assert.match(await note.getByRole("alert").innerText(), /另一位成员/);
  assert.equal((await prisma.travelMemory.findUniqueOrThrow({ where: { id: firstVisitId } })).content, "另一位成员先保存的版本。");
  assert.equal(await note.locator('[name="content"]').inputValue(), "暂存在本机的文字。");
  page.once("dialog", dialog => dialog.accept());
  await page.reload();
  await page.getByRole("button", { name: "丢弃草稿" }).click();
  await otherContext.close();

  const plan = await prisma.travelPlan.create({ data: { title: "一次从计划到回忆的旅行", startDate: new Date("2026-10-01T12:00:00Z"), notes: "计划中的私人信息不复制到手记。" } });
  await page.goto(`${host}/admin/plans/${plan.id}/record`);
  await page.locator(`input[name="placeIds"][value="${placeId}"]`).check();
  await page.getByRole("button", { name: "保存这次旅行的到访" }).click();
  await page.waitForURL(location => location.searchParams.get("recorded") === "1");
  const recorded = await prisma.travelMemory.findFirstOrThrow({ where: { planId: plan.id, placeId } });
  assert.equal(recorded.content, "");
  assert.equal(recorded.group, "both");
  assert.equal((await prisma.travelPlan.findUniqueOrThrow({ where: { id: plan.id } })).status, "COMPLETED");
  assert.equal(await prisma.travelMemory.count({ where: { planId: plan.id, placeId } }), 1);
  await page.goto(`${host}/admin/plans/${plan.id}/record`);
  const repeatId = await page.locator('[name="requestId"]').inputValue();
  const repeatPlace = page.locator(`input[name="repeatPlaceIds"][value="${placeId}"]`);
  await repeatPlace.check();
  await page.locator('[name="happenedAt"]').fill("2026-10-08");
  await page.getByRole("button", { name: "保存这次旅行的到访" }).click();
  await page.waitForURL(location => location.searchParams.get("recorded") === "1");
  assert.equal(await prisma.travelMemory.count({ where: { planId: plan.id, placeId } }), 2);
  assert.ok((await page.locator("#plan-memories").innerText()).includes("2026/10/08"));
  await page.goto(`${host}/admin/plans/${plan.id}/record`);
  await page.locator('[name="requestId"]').evaluate((input, value) => { input.value = value; }, repeatId);
  await page.locator('[name="happenedAt"]').fill("2026-10-08");
  await repeatPlace.check();
  await page.getByRole("button", { name: "保存这次旅行的到访" }).click();
  await page.waitForURL(location => location.searchParams.get("recorded") === "1");
  assert.equal(await prisma.travelMemory.count({ where: { planId: plan.id, placeId } }), 2, "Retry created a third visit");
  assert.equal((await prisma.travelMemory.findUniqueOrThrow({ where: { id: togetherVisitId } })).placeId, placeId);
  console.log("PHOTO_EDITORIAL_PASS: natural image ratios, captions, ordering, featuring, focal points, drafts, edit conflicts and plan handoff");
}
