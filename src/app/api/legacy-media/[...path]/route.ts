import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Private-backup compatibility route: files are read ONLY from the mounted data folder.
// Never serve arbitrary paths, and never depend on legacy files in the Docker image.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  if (!Array.isArray(path) || path.length < 2 || path.length > 4
    || path[0] !== "images" || path.some(part => !/^[a-zA-Z0-9._-]{1,120}$/.test(part) || part.startsWith("."))) {
    return new Response("Not found", { status: 404 });
  }
  const name = path[path.length - 1];
  const mime = name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg"
    : name.endsWith(".png") ? "image/png"
    : name.endsWith(".svg") ? "image/svg+xml"
    : name.endsWith(".webp") ? "image/webp" : null;
  if (!mime) return new Response("Not found", { status: 404 });
  try {
    const root = process.env.LEGACY_MEDIA_DIR || join(process.cwd(), "data", "legacy-images");
    const file = join(/* turbopackIgnore: true */ root, ...path);
    const bytes = await readFile(/* turbopackIgnore: true */ file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": mime, "Cache-Control": "public,max-age=3600", "X-Content-Type-Options": "nosniff", ...(mime === "image/svg+xml" ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}) },
    });
  } catch {
    // A restored DB without its old images should still show a valid placeholder.
    return NextResponse.redirect(new URL("/images/destination-placeholder.svg", _request.url), { status: 307 });
  }
}
