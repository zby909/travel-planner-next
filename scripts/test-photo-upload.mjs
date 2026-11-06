import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import sharp from "sharp";

// 模拟网络断开再重试整张照片，验证上传百分比、来源鉴权与单张照片的入库。
export async function verifyPhotoUpload({ page, host, placeId, prisma }) {
  const pixels = randomBytes(600 * 600 * 3);
  const photo = await sharp(pixels, { raw: { width: 600, height: 600, channels: 3 } }).png().toBuffer();
  const endpoint = host + "/api/admin/place-photos";

  const denied = await page.request.post(endpoint, {
    headers: { Origin: "https://attacker.example" },
    multipart: { placeId, image: { name: "test.png", mimeType: "image/png", buffer: photo } },
  });
  assert.equal(denied.status(), 403, "Cross-origin photo upload was accepted");

  const invalid = await page.request.post(endpoint, {
    headers: { Origin: host },
    multipart: { placeId, requestId: randomUUID(),
      image: { name: "invalid.png", mimeType: "image/png", buffer: Buffer.from("not-an-image-file-at-all") } },
  });
  assert.equal(invalid.status(), 400, "Corrupt image was accepted");

  await page.goto(host + `/admin/places/${placeId}`);
  let connectionFailed = false;
  let attempts = 0;
  await page.route("**/api/admin/place-photos", async route => {
    attempts++;
    if (!connectionFailed) {
      connectionFailed = true;
      await route.abort("failed");
    } else {
      await route.continue();
    }
  });
  await page.locator('.photo-upload input[type="file"]').setInputFiles({
    name: "progress-test.png", mimeType: "image/png", buffer: photo,
  });
  await page.getByRole("button", { name: "开始上传照片" }).click();
  await page.locator(".photo-upload .form-error").waitFor({ timeout: 15000 });
  assert.equal(await prisma.travelPhoto.count({ where: { memory: { placeId } } }), 0,
    "A network error unexpectedly committed the photo");
  await page.getByRole("button", { name: "重试剩余照片" }).click();
  await page.getByText("已上传 1 张照片。").waitFor({ timeout: 45000 });
  await page.locator(".place-gallery-grid .memory-admin-photo").first().waitFor({ timeout: 15000 });
  await page.unroute("**/api/admin/place-photos");
  assert.ok(connectionFailed && attempts === 2, "Failed single-photo upload was not retried correctly");
  assert.equal(await page.locator('progress[aria-label="照片上传进度"]').getAttribute("value"), "100");
  const note = await prisma.travelMemory.findUniqueOrThrow({
    where: { placeId }, include: { photos: { include: { mediaAsset: true } } },
  });
  assert.equal(note.photos.length, 1, "Retry created duplicate or missing photos");
  assert.equal(note.photos[0].mediaAsset?.mimeType, "image/webp");
  assert.equal(note.photos[0].mediaAsset?.status, "PUBLIC");

  // 模拟服务端已成功但响应丢失：同一编号再次提交不应追加第二张照片。
  const repeated = await page.request.post(endpoint, {
    headers: { Origin: host },
    multipart: { placeId, requestId: note.photos[0].mediaAssetId,
      image: { name: "progress-test.png", mimeType: "image/png", buffer: photo } },
  });
  assert.equal(repeated.status(), 201, "Retry after lost response was not accepted");
  assert.equal(await prisma.travelPhoto.count({ where: { memoryId: note.id } }), 1,
    "Retry after lost response created a duplicate photo");

  await page.setViewportSize({ width: 390, height: 844 });
  const mobile = await page.evaluate(() => ({
    bodyWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  assert.ok(mobile.bodyWidth <= mobile.viewportWidth + 8, "Photo upload page overflows a mobile viewport");
  assert.ok(await page.getByRole("button", { name: "开始上传照片" }).isVisible(),
    "Upload button disappeared on mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  return { photoId: note.photos[0].mediaAssetId, savedNoteId: note.id };
}
