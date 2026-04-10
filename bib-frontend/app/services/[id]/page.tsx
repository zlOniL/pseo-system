export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ServiceForm from '../_components/ServiceForm';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;
  const service = await api.getService(id).catch(() => null);
  if (!service) notFound();

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href="/services" className="bib-back">← Serviços</Link>
        <h1 className="bib-title mb-6">{service.name}</h1>

        {/* CTA Escala */}
        <Link
          href={`/services/${id}/scale`}
          className="flex items-center justify-between w-full bg-gray-900 text-white rounded-xl px-5 py-4 mb-6 hover:bg-gray-800 transition-colors group"
        >
          <div>
            <p className="text-sm font-semibold">Gerar Páginas por Cidade</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Seleciona regiões e cidades para geração em massa
            </p>
          </div>
          <svg
            className="w-5 h-5 text-gray-500 group-hover:translate-x-0.5 transition-transform"
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {/* Formulário */}
        <div className="bib-card">
          <p className="bib-label mb-4" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
            Configuração do Serviço
          </p>
          <ServiceForm initialData={service} />
        </div>
      </div>
    </div>
  );
}
