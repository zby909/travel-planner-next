// 仅允许站内绝对路径，避免登录后的 next 参数形成开放重定向。
export function safeInternalPath(value: unknown, fallback = "/admin"): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
    || value.includes("\\") || /[\u0000-\u001f]/.test(value)) return fallback;

  try {
    const target = new URL(value, "https://travel.local");
    if (target.origin !== "https://travel.local") return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
