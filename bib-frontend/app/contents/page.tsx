import { api } from "@/lib/api";
import Link from "next/link";
import { redirect } from "next/navigation";
import ContentsClient from "./_components/ContentsClient";

export const dynamic = "force-dynamic";

export default async function ContentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const siteId = resolvedSearchParams?.site_id;

  if (!siteId) {
    const sites = await api.listSites().catch(() => []);
    if (sites[0]?.id) redirect(`/contents?site_id=${sites[0].id}`);
  }

  const [services, site] = await Promise.all([
    siteId ? api.listServices(siteId).catch(() => []) : Promise.resolve([]),
    siteId ? api.getSite(siteId).catch(() => null) : Promise.resolve(null),
  ]);

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {site && <p className="text-xs text-gray-400 mb-2">Site: {site.name}</p>}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Conteúdos</h1>
          <Link
            href="/generate"
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Gerar nova página
          </Link>
        </div>

        <ContentsClient services={services} siteId={siteId} />
      </div>
    </div>
  );
}
