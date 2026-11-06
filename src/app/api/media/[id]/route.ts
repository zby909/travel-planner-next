import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { getSiteContentAccess } from "@/lib/site-access";
import { hasVisibleMediaReference } from "@/lib/media-lifecycle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
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
  try {
    const directory = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
    const safePath = join(/* turbopackIgnore: true */ directory, asset.id + ".webp");
    const bytes = await readFile(/* turbopackIgnore: true */ safePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": (access.visibility === "PRIVATE" || access.isMember) ? "private, no-store" : "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        ...((access.visibility === "PRIVATE" || access.isMember) ? { "X-Robots-Tag": "noindex" } : {}),
      },
    });
  } catch { return new Response("Not found", { status: 404 }); }
}
