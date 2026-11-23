// 对表单和旧库攻略使用相同的链接规则，让异常资料仍可在后台修正。
export function parseGuideUrl(value: string | null): URL | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.hostname && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}
