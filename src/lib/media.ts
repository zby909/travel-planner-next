// 将数据库中的足迹图片字段转换为公开页面可访问的 URL。
export function getPlaceImageUrl(image: string): string {
  const path = image.replace(/^\/+/, "");
  if (path.startsWith("api/media/")) return `/${path}`;
  if (path === "images/place-placeholder.svg") return "/images/place-placeholder.svg";
  return `/api/legacy-media/${path}`;
}
