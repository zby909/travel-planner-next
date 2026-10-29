import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/auth";
import { DestinationEditForm } from "@/components/admin-forms";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> };

export default async function DestinationEdit({ params, searchParams }: Props) {
  await requireEditor();
  const { id } = await params;
  const { saved } = await searchParams;
  const data = await prisma.destination.findUnique({ where: { id }, include: { flightPricing: true } });
  if (!data) notFound();
  return (
    <main>
      <Link className="admin-back" href="/admin/destinations">← 返回所有目的地</Link>
      <div className="admin-page-heading"><p className="eyebrow">EDIT DESTINATION</p><h1>{data.title}</h1><p>修改预算、基本资料和机票参考。其他原有攻略、图片和路线不会受影响。</p></div>
      {saved === "1" ? <p className="form-success" role="status">保存成功，公开页面已更新。</p> : null}
      <DestinationEditForm key={id} data={data} />
    </main>
  );
}
