// 将数据库中的足迹图片字段转换为公开页面可访问的 URL。
export function getPlaceImageUrl(image: string): string {
  const path = image.replace(/^\/+/, "");
  if (path.startsWith("api/media/") || path.startsWith("api/legacy-media/")) return `/${path}`;
  if (path === "images/place-placeholder.svg" || path === "images/destination-placeholder.svg") return `/${path}`;
  return `/api/legacy-media/${path}`;
}

// 统一旧库的相对图片路径、历史默认封面及已有的完整 URL。
export function getDestinationCoverUrl(id: string, image: string | null): string {
  if (!image) return `/api/legacy-media/images/${encodeURIComponent(id)}-0.jpg`;
  return /^https?:\/\//i.test(image) ? image : getPlaceImageUrl(image);
}

// 前台相册和编辑器使用相同的受管图片地址。
export function getPlacePhotoUrl(photo: {
  filePath: string;
  mediaAsset: { id: string; status: string; fileName: string } | null;
}): string | null {
  const asset = photo.mediaAsset;
  if (asset) {
    return asset.status === "PUBLIC" && asset.fileName === `${asset.id}.webp` ? `/api/media/${asset.id}` : null;
  }
  const path = photo.filePath.replace(/^\//, "");
  return /^api\/media\/[a-f0-9-]{36}$/i.test(path) ? `/${path}` : null;
}

// 仅对受管照片生成小图地址，仍由原图片接口检查访问权限。
export function photoPreviewUrl(src: string, width: 320 | 640 | 960): string {
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(src) ? `${src}?w=${width}` : src;
}

// 地点封面在不同尺寸的卡片中沿用相同的构图焦点。
export function coverPosition(place: { coverX: number; coverY: number }): string {
  return `${place.coverX}% ${place.coverY}%`;
}
