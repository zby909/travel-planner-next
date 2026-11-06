import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { PlaceCreateForm } from "@/components/admin-forms";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";

export default async function NewPlacePage() {
  await requireEditor();
  const settings = await getSiteSettings();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">ADD A PLACE</p><h1>记录一个去过的地方</h1><p>地点、故事、照片一次保存。坐标可以以后再补，不影响相册展示。</p></div>
    <PlaceCreateForm groupLabels={getGroupLabels(settings)} />
  </main>;
}
