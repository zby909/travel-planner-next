import "server-only";

import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { validateRestoreOrigin } from "@/lib/restore-auth";

// 照片上传只允许登录的两位编辑成员并校验请求来源。
export async function photoUploadEditor(request: NextRequest) {
  const actor = await getCurrentUser();
  if (!actor || !["ADMIN", "EDITOR"].includes(actor.role) || !validateRestoreOrigin(request)) return null;
  return actor;
}
