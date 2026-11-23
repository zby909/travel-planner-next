export const PHOTO_MAX_BYTES = 20 * 1024 * 1024;
export const DEFAULT_ALBUM_LIMITS = { albumMaxPhotos: 120, albumMaxMiB: 24 };

// 管理页面和上传事务使用相同的默认值及取值范围。
export function readAlbumLimits(values: ReadonlyMap<string, string>) {
  const photos = Number(values.get("albumMaxPhotos"));
  const mib = Number(values.get("albumMaxMiB"));
  return {
    albumMaxPhotos: Number.isInteger(photos) && photos >= 1 && photos <= 500 ? photos : DEFAULT_ALBUM_LIMITS.albumMaxPhotos,
    albumMaxMiB: Number.isInteger(mib) && mib >= 1 && mib <= 256 ? mib : DEFAULT_ALBUM_LIMITS.albumMaxMiB,
  };
}
