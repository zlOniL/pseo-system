import { api } from "@/lib/api";
import Link from "next/link";
import ContentsClient from "./_components/ContentsClient";

export const dynamic = "force-dynamic";

export default async function ContentsPage() {
  const services = await api.listServices().catch(() => []);

  return (
    <div className="h-full overflow-auto bg-white">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Conteúdos</h1>
          <Link
            href="/generate"
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            + Gerar nova página
          </Link>
        </div>

        <ContentsClient services={services} />
      </div>
    </div>
  );
}
