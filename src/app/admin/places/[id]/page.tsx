import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEditor } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlaceEditForm } from "@/components/admin-forms";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function AdminPlaceEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const data = await prisma.visitedPlace.findUnique({ where: { id } });
  if (!data) notFound();
  return <main>
    <Link className="admin-back" href="/admin/places">← 返回足迹列表</Link>
    <div className="admin-page-heading"><p className="eyebrow">EDIT PLACE</p><h1>{data.name}</h1></div>
    {(await searchParams).saved === "1" ? <p className="form-success" role="status">足迹地点已更新。</p> : null}
    <PlaceEditForm data={data} />
  </main>;
}
