import { api, ApiError } from "@/lib/api";
import { notFound } from "next/navigation";
import { UnifiedLayout } from "@/app/_components/UnifiedLayout";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const content = await api.getContent(id).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  });
  if (!content) notFound();

  return <UnifiedLayout initialContent={content} />;
}
