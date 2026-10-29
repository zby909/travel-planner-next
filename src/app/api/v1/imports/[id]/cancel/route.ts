import { NextRequest, NextResponse } from "next/server";
import { authenticateApi } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await prisma.importDraft.findUnique({ where: { id } });
  const scope = draft?.kind === "visits" ? "visits:write" : draft?.kind === "destinations" ? "destinations:write" : null;
  if (!scope) return NextResponse.json({ error: "draft not found" }, { status: 404 });
  const user = await authenticateApi(request, scope);
  if (!user || draft?.ownerId !== user.userId) return NextResponse.json({ error: "not authorized" }, { status: 401 });
  const changed = await prisma.importDraft.updateMany({ where: { id, ownerId: user.userId, status: "PREPARED" }, data: { status: "CANCELED" } });
  return NextResponse.json({ canceled: changed.count === 1 });
}
