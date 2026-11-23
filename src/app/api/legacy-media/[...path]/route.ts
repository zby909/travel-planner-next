import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { getSiteContentAccess } from "@/lib/site-access";
import { hasVisibleLegacyReference } from "@/lib/media-lifecycle";
import { validBackupImagePath } from "@/lib/backup-format";
import { restoreDataDir } from "@/lib/backup-restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Private-backup compatibility route: files are read ONLY from the mounted data folder.
// Never serve arbitrary paths, and never depend on legacy files in the Docker image.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const access = await getSiteContentAccess();
  if (!access.allowed) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" } });
  }
  const { path } = await params;
  if (!Array.isArray(path) || path[0] !== "images" || !validBackupImagePath(path.join("/"))) {
    return new Response("Not found", { status: 404 });
  }
  const name = path[path.length - 1].toLowerCase();
  const mime = name.endsWith(".jpg") || name.endsWith(".jpeg") ? "image/jpeg"
    : name.endsWith(".png") ? "image/png"
    : name.endsWith(".svg") ? "image/svg+xml"
    : name.endsWith(".webp") ? "image/webp" : null;
  if (!mime) return new Response("Not found", { status: 404 });
  if (!access.isMember && !await hasVisibleLegacyReference(path.join("/"))) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    const dataDir = restoreDataDir();
    const root = process.env.LEGACY_MEDIA_DIR || join(dataDir, "legacy-images");
    const file = join(/* turbopackIgnore: true */ root, ...path);
    const bytes = await readFile(/* turbopackIgnore: true */ file);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": (access.visibility === "PRIVATE" || access.isMember) ? "private, no-store" : "public, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        ...((access.visibility === "PRIVATE" || access.isMember) ? { "X-Robots-Tag": "noindex" } : {}),
        ...(mime === "image/svg+xml" ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {}),
      },
    });
  } catch {
    // A restored DB without its old images should still show a valid placeholder.
    return new Response(null, { status: 307, headers: { Location: "/images/destination-placeholder.svg", "Cache-Control": "no-store" } });
  }
}
