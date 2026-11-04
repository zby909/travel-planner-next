import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSiteVisibility } from "@/lib/site-settings";

// 检查当前访客是否可以读取公开旅行内容及其图片。
export async function getSiteContentAccess() {
  const [visibility, user] = await Promise.all([getSiteVisibility(), getCurrentUser()]);
  const isMember = Boolean(user && ["ADMIN", "EDITOR"].includes(user.role));
  return { visibility, allowed: visibility === "PUBLIC" || isMember };
}

// 私密站点拒绝匿名页面访问，并保留登录后的原始访问地址。
export async function requireSiteContentAccess(path: string): Promise<void> {
  const access = await getSiteContentAccess();
  if (!access.allowed) redirect(`/login?next=${encodeURIComponent(path)}`);
}
