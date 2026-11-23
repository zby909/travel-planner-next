import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getSiteContentAccess } from "@/lib/site-access";
import { hasVisibleMediaReference } from "@/lib/media-lifecycle";
import { getMediaCacheDirectory, getMediaCachePath, getUploadDirectory, MEDIA_PREVIEW_WIDTHS } from "@/lib/media-storage";
import sharp from "sharp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 优先读取持久化缩略图缓存，未命中时按需编码并原子写入缓存文件。
async function loadMediaVariant(id: string, width: string | null): Promise<Buffer> {
  const originalPath = join(/* turbopackIgnore: true */ getUploadDirectory(), `${id}.webp`);
  if (!width) return readFile(/* turbopackIgnore: true */ originalPath);

  const cachePath = getMediaCachePath(id, width);
  const cached = await readFile(/* turbopackIgnore: true */ cachePath).catch(() => null);
  if (cached) return cached;

  const original = await readFile(/* turbopackIgnore: true */ originalPath);
  const resized = await sharp(original, { limitInputPixels: 40_000_000 })
    .resize({ width: Number(width), withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();

  const cacheDir = getMediaCacheDirectory();
  const tempPath = join(/* turbopackIgnore: true */ cacheDir, `${id}-w${width}-${randomUUID()}.tmp`);
  try {
    await mkdir(/* turbopackIgnore: true */ cacheDir, { recursive: true });
    await writeFile(/* turbopackIgnore: true */ tempPath, resized, { flag: "wx" });
    await rename(/* turbopackIgnore: true */ tempPath, /* turbopackIgnore: true */ cachePath);
  } catch {
    await rm(/* turbopackIgnore: true */ tempPath, { force: true }).catch(() => {});
  }
  return resized;
}

// 原图和缩略图均逐次核对成员身份与当前可见引用，命中协商缓存时直接返回 304。
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const access = await getSiteContentAccess();
  if (!access.allowed) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  }
  const { id } = await params;
  if (!/^[a-z0-9-]{20,60}$/i.test(id)) return new Response("Not found", { status: 404 });
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  // 上传图片统一保存为「资源 ID.webp」；不信任备份数据库中恢复的任意文件名。
  if (!asset || asset.status !== "PUBLIC" || asset.mimeType !== "image/webp" || asset.fileName !== `${asset.id}.webp`) {
    return new Response("Not found", { status: 404 });
  }
  if (!access.isMember && !await hasVisibleMediaReference(id)) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const width = new URL(request.url).searchParams.get("w");
  if (width !== null && !(MEDIA_PREVIEW_WIDTHS as readonly string[]).includes(width)) return new Response("Invalid size", { status: 400 });

  const restricted = access.visibility === "PRIVATE" || access.isMember;
  const etag = `"${asset.id}-${width ?? "orig"}-${asset.byteSize}"`;
  const headers: Record<string, string> = {
    "Cache-Control": restricted ? "private, no-store" : "public, max-age=0, must-revalidate",
    "ETag": etag,
    "Vary": "Cookie",
    "X-Content-Type-Options": "nosniff",
    ...(restricted ? { "X-Robots-Tag": "noindex" } : {}),
  };
  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers });
  }

  try {
    const bytes = await loadMediaVariant(asset.id, width);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/webp", ...headers },
    });
  } catch { return new Response("Not found", { status: 404 }); }
}
