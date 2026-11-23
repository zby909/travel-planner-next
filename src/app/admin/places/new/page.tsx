import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { PlaceCreateForm } from "@/components/admin-forms";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";

export default async function NewPlacePage() {
  await requireEditor();
  const settings = await getSiteSettings();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><h1>记录一个去过的地方</h1><p>填写地点和首次到访的信息，保存后可以上传相册。</p></div>
    <PlaceCreateForm groupLabels={getGroupLabels(settings)} />
  </main>;
}
