export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { api } from '@/lib/api';

export default async function ServicesPage() {
  const services = await api.listServices().catch(() => []);

  return (
    <div className="bib-page">
      <div className="bib-container">

        <div className="bib-page-header">
          <div>
            <h1 className="bib-title">Serviços</h1>
            <p className="bib-subtitle">
              {services.length} serviço{services.length !== 1 ? 's' : ''} activo{services.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/services/new" className="bib-btn bib-btn-primary">
            + Novo Serviço
          </Link>
        </div>

        {services.length === 0 ? (
          <div className="bib-empty">
            <p>Nenhum serviço criado ainda.</p>
            <Link href="/services/new" className="mt-2 inline-block text-sm text-gray-700 underline">
              Criar primeiro serviço
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {services.map((service) => (
              <Link
                key={service.id}
                href={`/services/${service.id}`}
                className="group flex items-center gap-4 bib-card hover:border-gray-300 hover:shadow-sm transition-all py-4"
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 overflow-hidden border border-gray-100">
                  {service.video_url ? (
                    <video src={service.video_url} preload="metadata" muted className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-6 h-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.723v6.554a1 1 0 01-1.447.894L15 14M4 8h11a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 group-hover:text-gray-700">
                    {service.name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {service.images.filter(Boolean).length} imagem{service.images.filter(Boolean).length !== 1 ? 'ns' : ''}
                    {service.service_notes && ' · tem notas'}
                  </p>
                </div>

                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 shrink-0">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
