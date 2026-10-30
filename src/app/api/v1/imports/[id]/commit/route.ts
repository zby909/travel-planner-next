import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { commitImport } from "@/lib/import-service";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[a-z0-9]{12,40}$/i.test(id)) return NextResponse.json({ error: "invalid draft id" }, { status: 400 });
  const draft = await prisma.importDraft.findUnique({ where: { id }, select: { kind: true } });
  const scope = draft?.kind === "visits" || draft?.kind === "visits-update" || draft?.kind === "timeline" ? "visits:write"
    : draft?.kind === "destinations" || draft?.kind === "destinations-update" ? "destinations:write" : null;
  if (!scope) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  const user = await authenticateApi(request, scope);
  if (!user) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  try {
    const result = await commitImport(id, user.userId);
    revalidatePath("/");
    revalidatePath("/visited");
    revalidatePath("/admin");
    revalidatePath("/admin/destinations");
    revalidatePath("/admin/places");
    if (result.kind === "destinations" || result.kind === "destinations-update") {
      for (const entry of [...("created" in result ? result.created : []), ...("updated" in result ? result.updated : [])]) {
        revalidatePath(`/destinations/${entry.id}`);
      }
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "commit failed" }, { status: 409 });
  }
}
