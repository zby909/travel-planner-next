import Link from "next/link";
import { requireEditor } from "@/lib/auth";
import { DestinationCreateForm } from "@/components/admin-forms";

export default async function NewDestinationPage() {
  await requireEditor();
  return <main>
    <Link className="admin-back" href="/admin/destinations">← 返回目的地列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">NEW DESTINATION</p><h1>新增旅行目的地</h1><p>先建立基础信息，之后可以继续补充预算、航班、路线、攻略和照片。</p></div>
    <DestinationCreateForm />
  </main>;
}
