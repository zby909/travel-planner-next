import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";

export function validateRestoreOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN
    || `${request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "")}://${request.headers.get("x-forwarded-host") || request.headers.get("host")}`;
  try { return Boolean(origin && new URL(origin).origin === new URL(expected).origin); }
  catch { return false; }
}
export async function restoreAdministrator(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return null;
  if (!validateRestoreOrigin(request)) return null;
  return user;
}
export const noStore = { "Cache-Control": "no-store" };
