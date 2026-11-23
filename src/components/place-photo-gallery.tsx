"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useState, type CSSProperties } from "react";
import { DestinationPhotoLightbox } from "@/components/destination-photo-lightbox";
import styles from "./place-photo-gallery.module.css";
import { photoPreviewUrl } from "@/lib/media";

export type PlaceGalleryPhoto = {
  id: string;
  src: string;
  alt: string;
  caption?: string | null;
  width?: number | null;
  height?: number | null;
  href?: string;
  label?: string;
};

// 将地点相册展示为杂志式照片墙，并复用全屏照片浏览器。
export function PlacePhotoGallery({ placeName, caption, photos, featured = false }: { placeName: string; caption: string; photos: PlaceGalleryPhoto[]; featured?: boolean }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const closeLightbox = useCallback(() => setActiveIndex(null), []);
  const selection = {
    title: `${placeName} · ${caption}`,
    titles: photos.map(photo => photo.label || `${placeName} · ${caption}`),
    images: photos.map(photo => photo.src),
    altTexts: photos.map(photo => photo.alt),
    captions: photos.map(photo => photo.caption ?? ""),
  };

  return (
    <>
      <div className={`${styles.gallery}${featured ? ` ${styles.featured}` : ""}`} role="group" aria-label={`${caption}的照片相册`}
        style={{ "--gallery-columns": Math.min(featured ? 3 : 2, photos.length) } as CSSProperties}>
        {photos.map((photo, index) => (
          <figure className={styles.frame} key={photo.id}>
            <button
            className={styles.photo}
            type="button"
            onClick={() => setActiveIndex(index)}
            aria-label={`放大查看${placeName}的第 ${index + 1} 张照片`}
            style={{ aspectRatio: photo.width && photo.height ? `${photo.width}/${photo.height}` : undefined }}
          >
            <Image src={photoPreviewUrl(photo.src, 960)} alt={photo.alt} fill={Boolean(photo.width && photo.height)}
              width={photo.width && photo.height ? undefined : 1920} height={photo.width && photo.height ? undefined : 1280}
              style={photo.width && photo.height ? undefined : { width: "100%", height: "auto", position: "static", display: "block" }}
              unoptimized sizes="(max-width: 760px) 92vw, (max-width: 1100px) 70vw, 800px" />
            <span aria-hidden="true">↗</span>
          </button>
          {photo.caption || photo.href ? <figcaption>
            {photo.caption ? <p>{photo.caption}</p> : null}
            {photo.href ? <Link href={photo.href}>{photo.label} ↗</Link> : null}
          </figcaption> : null}
          </figure>
        ))}
      </div>
      {activeIndex !== null ? (
        <DestinationPhotoLightbox selection={selection} initialIndex={activeIndex} onClose={closeLightbox} />
      ) : null}
    </>
  );
}
