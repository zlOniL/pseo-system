import { api } from "@/lib/api";
import Link from "next/link";
import ContentsClient from "./_components/ContentsClient";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ status?: string; service?: string; city?: string }>;
}

export default async function ContentsPage({ searchParams }: Props) {
  const params = await searchParams;

  const [allContents, services] = await Promise.all([
    api.listContents().catch(() => []),
    api.listServices().catch(() => []),
  ]);

  // Server-side filtering
  const contents = allContents.filter((c) => {
    if (params.status && c.status !== params.status) return false;
    if (params.service && !c.service.toLowerCase().includes(params.service.toLowerCase()))
      return false;
    if (params.city && !c.city.toLowerCase().includes(params.city.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Conteúdos</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              {contents.length} página{contents.length !== 1 ? "s" : ""}
              {allContents.length !== contents.length && ` (de ${allContents.length} no total)`}
            </p>
          </div>
          <Link
            href="/generate"
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Gerar nova página
          </Link>
        </div>

        <ContentsClient
          contents={contents}
          services={services}
          activeFilters={params}
        />
      </div>
    </div>
  );
}
