import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { SiteSettingsForm } from "@/components/admin-forms";
import { getSiteSettings } from "@/lib/site-settings";

export default async function SiteSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await requireEditor();
  if (user.role !== "ADMIN") notFound();
  const settings = await getSiteSettings();
  return <main>
    <div className="admin-page-heading"><p className="eyebrow">SITE CONFIGURATION</p><h1>站点设置</h1><p>设置你们的站点名称、两位成员显示名，以及两人旅行预算使用的币种。</p></div>
    {(await searchParams).saved === "1" ? <p className="form-success" role="status">站点设置已保存，公开页面已更新。</p> : null}
    <SiteSettingsForm settings={settings} />
  </main>;
}
