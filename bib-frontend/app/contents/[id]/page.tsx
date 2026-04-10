import { api } from "@/lib/api";
import { notFound } from "next/navigation";
import { UnifiedLayout } from "@/app/_components/UnifiedLayout";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await api.getContent(id).catch(() => null);
  if (!content) notFound();

  return <UnifiedLayout initialContent={content} />;
}
