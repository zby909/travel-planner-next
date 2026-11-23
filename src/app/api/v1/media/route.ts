import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import sharp, { type OutputInfo } from "sharp";
import { authenticateApi } from "@/lib/api-auth";
import { getUploadDirectory } from "@/lib/media-storage";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const user = await authenticateApi(request, "media:write");
  if (!user) return NextResponse.json({ error: "requires media:write" }, { status: 401, headers: noStore });
  const declaredHeader = request.headers.get("content-length");
  if (!declaredHeader) return NextResponse.json({ error: "Content-Length required for image uploads" }, { status: 411, headers: noStore });
  const declaredLength = Number(declaredHeader);
  if (!Number.isSafeInteger(declaredLength) || declaredLength < 1 || declaredLength > MAX_FILE_BYTES + 10240) {
    return NextResponse.json({ error: "image exceeds 8 MiB" }, { status: 413, headers: noStore });
  }
  let file: File;
  try {
    const form = await request.formData();
    const value = form.get("image");
    if (!(value instanceof File)) throw new Error("missing image");
    file = value;
  } catch {
    return NextResponse.json({ error: "expected multipart form-data with image file" }, { status: 400, headers: noStore });
  }
  if (file.size < 20 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "supported image size is 20 bytes to 8 MiB" }, { status: 413, headers: noStore });
  }
  let processed: { data: Buffer; info: OutputInfo };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error" });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "")) throw new Error("unsupported image");
    if ((metadata.pages ?? 1) > 1) throw new Error("animated images are not supported");
    // Re-encode to strip GPS EXIF/metadata, orient the picture, and reduce storage.
    processed = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82, effort: 4 }).toBuffer({ resolveWithObject: true });
  } catch {
    return NextResponse.json({ error: "only valid JPEG, PNG and non-animated WebP are supported" }, { status: 415, headers: noStore });
  }
  const id = randomUUID();
  const fileName = id + ".webp";
  const dir = getUploadDirectory();
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, fileName), processed.data, { flag: "wx" });
  try {
    await prisma.mediaAsset.create({
      data: {
        id, ownerId: user.userId, fileName, mimeType: "image/webp",
        byteSize: processed.data.length, width: processed.info.width, height: processed.info.height,
      },
    });
  } catch {
    await unlink(join(dir, fileName)).catch(() => {});
    return NextResponse.json({ error: "could not save image metadata" }, { status: 500, headers: noStore });
  }
  return NextResponse.json({
    imageId: id, bytes: processed.data.length, status: "STAGED",
    note: "Image is private until a confirmed import references it; unreferenced staged images may be cleaned later.",
  }, { status: 201, headers: noStore });
}
