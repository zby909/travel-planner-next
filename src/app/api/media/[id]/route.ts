import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9-]{20,60}$/i.test(id)) return new Response("Not found", { status: 404 });
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset || asset.status !== "PUBLIC") return new Response("Not found", { status: 404 });
  try {
    const directory = process.env.UPLOAD_DIR || join(process.cwd(), "data", "uploads");
    const safePath = join(/* turbopackIgnore: true */ directory, asset.fileName);
    const bytes = await readFile(/* turbopackIgnore: true */ safePath);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": asset.mimeType, "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff" },
    });
  } catch { return new Response("Not found", { status: 404 }); }
}
