import "server-only";
import { prisma } from "@/lib/prisma";

export type SiteSettings = {
  siteName: string;
  siteSubtitle: string;
  primaryMemberName: string;
  secondaryMemberName: string;
  togetherLabel: string;
  currency: string;
};

export type GroupLabels = { both: string; her: string; mine: string };

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "下一站",
  siteSubtitle: "THE NEXT JOURNEY",
  primaryMemberName: "我",
  secondaryMemberName: "TA",
  togetherLabel: "我们一起去过",
  currency: "CNY",
};

// 读取站点配置；未配置的字段使用安全默认值，旧数据库无需迁移。
export async function getSiteSettings(): Promise<SiteSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: ["siteName", "siteSubtitle", "primaryMemberName", "secondaryMemberName", "togetherLabel", "currency"] } },
  });
  const values = new Map(rows.map(row => [row.key, row.value]));
  return {
    siteName: values.get("siteName") || DEFAULT_SETTINGS.siteName,
    siteSubtitle: values.get("siteSubtitle") ?? DEFAULT_SETTINGS.siteSubtitle,
    primaryMemberName: values.get("primaryMemberName") || DEFAULT_SETTINGS.primaryMemberName,
    secondaryMemberName: values.get("secondaryMemberName") || DEFAULT_SETTINGS.secondaryMemberName,
    togetherLabel: values.get("togetherLabel") || DEFAULT_SETTINGS.togetherLabel,
    currency: values.get("currency") || DEFAULT_SETTINGS.currency,
  };
}

// 将足迹数据中的固定分组值转换为当前站点配置的显示名称。
export function getGroupLabels(settings: SiteSettings): GroupLabels {
  return {
    both: settings.togetherLabel,
    her: `${settings.secondaryMemberName}单独去过`,
    mine: `${settings.primaryMemberName}单独去过`,
  };
}
