import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { PlaceCreateForm } from "@/components/admin-forms";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";

export default async function NewPlacePage() {
  await requireEditor();
  const settings = await getSiteSettings();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">ADD A PLACE</p><h1>记录一个去过的地方</h1><p>先保存地点和一份旅行文字，接着上传照片；逐张显示上传进度。</p></div>
    <PlaceCreateForm groupLabels={getGroupLabels(settings)} />
  </main>;
}
