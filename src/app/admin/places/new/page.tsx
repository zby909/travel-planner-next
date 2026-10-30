import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { PlaceCreateForm } from "@/components/admin-forms";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";

export default async function NewPlacePage() {
  await requireEditor();
  const settings = await getSiteSettings();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">NEW PLACE</p><h1>新增足迹地点</h1><p>地点会显示在足迹列表中；填写国家、省份、城市和坐标后，也可以参与地图展示。</p></div>
    <PlaceCreateForm groupLabels={getGroupLabels(settings)} />
  </main>;
}
