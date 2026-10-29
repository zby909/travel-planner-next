import { NextRequest, NextResponse } from "next/server";
import { noStore, restoreAdministrator } from "@/lib/restore-auth";
import { queueRestore } from "@/lib/backup-restore";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const user = await restoreAdministrator(request);
  if (!user) return NextResponse.json({ error: "仅允许同源管理员确认恢复" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "需要 application/json" }, { status: 415 });
  try {
    const value = await request.json();
    if (typeof value?.id !== "string") return NextResponse.json({ error: "缺少恢复任务编号" }, { status: 400 });
    const preview = await queueRestore(value.id, user.id);
    return NextResponse.json({ queued: true, id: preview.id, message: "恢复已排队。现在从 StackNest 重启该应用，容器会自动恢复备份。" }, { headers: noStore });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "排队失败" }, { status: 409, headers: noStore });
  }
}
