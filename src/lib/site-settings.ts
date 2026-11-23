import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { isSupportedCurrency, type SupportedCurrency } from "@/lib/money";
import { DEFAULT_ALBUM_LIMITS, readAlbumLimits } from "@/lib/place-album-limits";

export type SiteVisibility = "PUBLIC" | "PRIVATE";

export type SiteSettings = {
  siteName: string;
  siteSubtitle: string;
  primaryMemberName: string;
  secondaryMemberName: string;
  togetherLabel: string;
  currency: SupportedCurrency;
  visibility: SiteVisibility;
  albumMaxPhotos: number;
  albumMaxMiB: number;
};

export type GroupLabels = { both: string; her: string; mine: string };

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "下一站",
  siteSubtitle: "THE NEXT JOURNEY",
  primaryMemberName: "我",
  secondaryMemberName: "TA",
  togetherLabel: "我们一起去过",
  currency: "CNY",
  visibility: "PUBLIC",
  ...DEFAULT_ALBUM_LIMITS,
};

// 读取站点配置；未配置的字段使用安全默认值，旧数据库无需迁移。
export const getSiteSettings = cache(async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: Object.keys(DEFAULT_SETTINGS) } },
  });
  const values = new Map(rows.map(row => [row.key, row.value]));
  return {
    siteName: values.get("siteName") || DEFAULT_SETTINGS.siteName,
    siteSubtitle: values.get("siteSubtitle") ?? DEFAULT_SETTINGS.siteSubtitle,
    primaryMemberName: values.get("primaryMemberName") || DEFAULT_SETTINGS.primaryMemberName,
    secondaryMemberName: values.get("secondaryMemberName") || DEFAULT_SETTINGS.secondaryMemberName,
    togetherLabel: values.get("togetherLabel") || DEFAULT_SETTINGS.togetherLabel,
    currency: (() => {
      const configured = values.get("currency") || "";
      return isSupportedCurrency(configured) ? configured : DEFAULT_SETTINGS.currency;
    })(),
    visibility: values.get("visibility") === "PRIVATE" ? "PRIVATE" : "PUBLIC",
    ...readAlbumLimits(values),
  };
});

// 按单次请求缓存访问模式，同一渲染周期内避免重复查库，每次新 HTTP 请求依然实时读取。
export const getSiteVisibility = cache(async function getSiteVisibility(): Promise<SiteVisibility> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: "visibility" },
    select: { value: true },
  });
  return setting?.value === "PRIVATE" ? "PRIVATE" : "PUBLIC";
});

// 将足迹数据中的固定分组值转换为当前站点配置的显示名称。
export function getGroupLabels(settings: SiteSettings): GroupLabels {
  return {
    both: settings.togetherLabel,
    her: `${settings.secondaryMemberName}单独去过`,
    mine: `${settings.primaryMemberName}单独去过`,
  };
}
