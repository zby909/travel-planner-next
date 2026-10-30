import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaceEditForm } from "@/components/admin-forms";
import { CoverUploadForm } from "@/components/cover-upload-form";
import { getPlaceImageUrl } from "@/lib/media";
import { getGroupLabels, getSiteSettings } from "@/lib/site-settings";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string; created?: string; photo?: string }> };

export default async function AdminPlaceEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const [data, settings] = await Promise.all([
    prisma.visitedPlace.findUnique({ where: { id } }),
    getSiteSettings(),
  ]);
  if (!data) notFound();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">EDIT PLACE</p><h1>{data.name}</h1></div>
    {(await searchParams).created === "1" ? <p className="form-success" role="status">足迹地点已创建。</p> : null}
    {(await searchParams).saved === "1" ? <p className="form-success" role="status">足迹地点已更新。</p> : null}
    {(await searchParams).photo === "1" ? <p className="form-success" role="status">足迹照片已更新。</p> : null}
    <CoverUploadForm id={id} kind="place" imageUrl={getPlaceImageUrl(data.image)} />
    <PlaceEditForm data={data} groupLabels={getGroupLabels(settings)} />
  </main>;
}
