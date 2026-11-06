import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";

// 在既有双账号浏览器会话中验证费用编辑、可逆归档及共享照片回收。
export async function verifyRecordLoops({ page, browser, host, prisma, planId, destinationId, memoryId, photoBuffer }) {
  const guest = await browser.newPage();
  try {
    const expense = await prisma.expense.findFirstOrThrow({ where: { planId, category: "FOOD" } });
    await page.goto(`${host}/admin/plans/${planId}?editExpense=${expense.id}#plan-expenses`);
    const form = page.locator(".expense-form");
    assert.equal(await form.locator('[name="amount"]').inputValue(), "250.25");
    await form.locator('[name="amount"]').fill("260.30");
    await form.locator('[name="description"]').fill("编辑后的餐饮");
    await form.getByRole("button", { name: "保存费用修改" }).click();
    await page.waitForURL(url => url.searchParams.get("expenseSaved") === "1");
    assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).amountMinor, 26030);
    assert.match(await page.locator(".expense-overview").innerText(), /2,310\.80/);
    assert.equal(await prisma.expense.count({ where: { planId } }), 3);
    const otherPlan = await prisma.travelPlan.create({ data: { title: "费用归属边界测试", currency: "SGD" } });
    assert.equal((await page.goto(`${host}/admin/plans/${otherPlan.id}?editExpense=${expense.id}`)).status(), 404);
    await page.goto(`${host}/admin/plans/${planId}?editExpense=${expense.id}`);
    const guardedForm = page.locator(".expense-form");
    await guardedForm.locator('input[name="planId"]').evaluate((input, value) => { input.value = value; }, otherPlan.id);
    await guardedForm.getByRole("button", { name: "保存费用修改" }).click();
    await guardedForm.getByRole("alert").waitFor();
    assert.match(await guardedForm.getByRole("alert").innerText(), /不属于/);
    assert.equal((await prisma.expense.findUniqueOrThrow({ where: { id: expense.id } })).planId, planId);
    await prisma.travelPlan.delete({ where: { id: otherPlan.id } });

    const memory = await prisma.travelMemory.findUniqueOrThrow({ where: { id: memoryId }, include: { photos: true } });
    const photoUrl = memory.photos[0].filePath;
    await page.goto(`${host}/admin/destinations/${destinationId}`);
    await page.getByRole("button", { name: "归档记录", exact: true }).click();
    await page.getByRole("button", { name: "恢复展示", exact: true }).waitFor();
    assert.equal((await guest.goto(`${host}/destinations/${destinationId}`)).status(), 404);
    await guest.goto(`${host}/`);
    assert.equal(await guest.locator(`.editorial-destination a[href="/destinations/${destinationId}"]`).count(), 0);
    await page.goto(`${host}/admin/destinations?view=archived`);
    assert.equal(await page.locator(`a[href="/admin/destinations/${destinationId}"]`).count(), 1);
    assert.equal((await prisma.travelPlan.findUniqueOrThrow({ where: { id: planId } })).destinationId, destinationId);
    await page.goto(`${host}/admin/destinations/${destinationId}`);
    await page.getByRole("button", { name: "恢复展示", exact: true }).click();
    await page.getByRole("button", { name: "归档记录", exact: true }).waitFor();
    assert.equal((await guest.goto(`${host}/destinations/${destinationId}`)).status(), 200);

    await page.goto(`${host}/admin/places/test-town`);
    await page.locator(".place-more-options").evaluate(details => { details.open = true; });
    await page.getByRole("button", { name: "归档记录", exact: true }).click();
    await page.getByRole("button", { name: "恢复展示", exact: true }).waitFor();
    await guest.goto(`${host}/visited`);
    assert.equal(await guest.locator("#place-test-town").count(), 0);
    assert.equal(await guest.locator(".atlas-entry").filter({ hasText: "示例小镇" }).count(), 0, "关联归档足迹的时间轴仍在前台");
    await guest.goto(`${host}/memories`);
    assert.equal(await guest.locator(".memory-story").filter({ hasText: "抵达京都的第一天" }).count(), 0);
    assert.equal((await guest.request.get(host + photoUrl)).status(), 404, "归档日记照片被匿名访问");
    const memberPhoto = await page.request.get(host + photoUrl);
    assert.equal(memberPhoto.status(), 200);
    assert.match(memberPhoto.headers()["cache-control"], /private/);
    assert.equal(await prisma.travelPhoto.count({ where: { memoryId } }), 1, "归档不能删照片");
    await page.locator(".place-more-options").evaluate(details => { details.open = true; });
    await page.getByRole("button", { name: "恢复展示", exact: true }).click();
    await page.locator(".place-more-options").evaluate(details => { details.open = true; });
    await page.getByRole("button", { name: "归档记录", exact: true }).waitFor();
    assert.equal((await guest.request.get(host + photoUrl)).status(), 200);
    await guest.goto(`${host}/visited`);
    assert.equal(await guest.locator("#place-test-town").count(), 1);
    assert.ok((await guest.locator(".atlas-entry").count()) >= 1, "恢复地点后时间轴应重新显示故事");

    const oldCover = (await prisma.destination.findUniqueOrThrow({ where: { id: destinationId } })).imagePath;
    const oldId = oldCover.split("/").at(-1);
    await prisma.visitedPlace.update({ where: { id: "test-town" }, data: { image: oldCover } });
    // 两个记录共用的图片要等最后一个引用被替换后才删除。
    for (const route of [`/admin/destinations/${destinationId}`, "/admin/places/test-town"]) {
      await page.goto(host + route);
      if (route.includes("/places/")) await page.locator(".place-more-options").evaluate(details => { details.open = true; });
      await page.locator('input[name="image"]').setInputFiles({ name: "new-cover.png", mimeType: "image/png", buffer: photoBuffer });
      await page.getByRole("button", { name: "保存封面照片" }).click();
      await page.waitForURL(url => url.searchParams.get("photo") === "1");
      const shared = await prisma.mediaAsset.findUnique({ where: { id: oldId } });
      if (route.includes("destinations")) assert.ok(shared, "仍被足迹引用的封面被误删");
      else assert.equal(shared, null, "最后引用移除后旧封面未清理");
    }
    assert.equal((await guest.request.get(host + oldCover)).status(), 404);
    assert.equal(existsSync(join(process.env.UPLOAD_DIR, `${oldId}.webp`)), false);

    // 日记照片可被封面共用；删日记不能误删这张封面。
    await prisma.destination.update({ where: { id: "test-island" }, data: { imagePath: photoUrl } });
    await page.goto(`${host}/admin/places/test-town`);
    page.once("dialog", dialog => dialog.accept());
    await page.locator(".memory-admin-photo").first().getByRole("button", { name: "移除照片" }).click();
    await page.waitForURL(url => url.searchParams.get("photoDeleted") === "1");
    assert.ok(await prisma.mediaAsset.findUnique({ where: { id: photoUrl.split("/").at(-1) } }));
    assert.equal((await guest.request.get(host + photoUrl)).status(), 200);
    const denied = await guest.request.post(host + "/api/admin/backup", { headers: { Origin: host } });
    assert.equal(denied.status(), 403);
    const csrf = await page.request.post(host + "/api/admin/backup", { headers: { Origin: "https://other.example" } });
    assert.equal(csrf.status(), 403);
    console.log("RECORD_LOOPS_PASS: expense edit, archive restore, related stories, media gate, shared cover/photo cleanup");
  } finally { await guest.close(); }
}
