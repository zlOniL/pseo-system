export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import ServiceForm from '../_components/ServiceForm';
import DeleteServiceButton from './_components/DeleteServiceButton';
import FtpRemotePagePanel from './_components/FtpRemotePagePanel';
import { scaleGenerateHref } from '@/lib/routes';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ServiceDetailPage({ params }: Props) {
  const { id } = await params;
  const service = await api.getService(id).catch(() => null);
  if (!service) notFound();

  const site = service.site_id ? await api.getSite(service.site_id).catch(() => null) : null;
  const mainContentSummary = await api
    .getMainTemplateContentSummary(id)
    .catch(() => ({ exists: false }));
  const hasMainContent = mainContentSummary.exists;
  const scaleHref = scaleGenerateHref({ serviceId: id, siteId: service.site_id });
  const defaultRemotePath = `${service.slug}.html`;
  const ftpTemplateStatus =
    site?.integration_type === 'ftp_html'
      ? await api.getFtpTemplateStatus(service.id, defaultRemotePath).catch(() => null)
      : null;

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href="/services" className="bib-back">← Serviços</Link>
        <h1 className="bib-title mb-6">{service.name}</h1>

        {/* CTA Escala */}
        <Link
          href={scaleHref}
          className={`flex items-center justify-between w-full rounded-xl px-5 py-4 mb-6 transition-colors group ${
            hasMainContent
              ? 'bg-gray-900 text-white hover:bg-gray-800'
              : 'bg-amber-50 text-amber-950 border border-amber-200 hover:bg-amber-100'
          }`}
        >
          <div>
            <p className="text-sm font-semibold">
              {hasMainContent ? 'Gerar Páginas por Cidade' : 'Criar página principal'}
            </p>
            <p className={`text-xs mt-0.5 ${hasMainContent ? 'text-gray-400' : 'text-amber-700'}`}>
              {hasMainContent
                ? 'Abre a central de produção com este serviço selecionado'
                : 'Este serviço ainda não tem página principal. O cockpit abre no modal correto.'}
            </p>
          </div>
          <svg
            className={`w-5 h-5 group-hover:translate-x-0.5 transition-transform ${hasMainContent ? 'text-gray-500' : 'text-amber-700'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        {site?.integration_type === 'ftp_html' && (
          <FtpRemotePagePanel
            serviceId={service.id}
            defaultRemotePath={defaultRemotePath}
            initialStatus={ftpTemplateStatus}
          />
        )}

        {/* Formulário */}
        <div className="bib-card">
          <p className="bib-label mb-4" style={{ fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
            Configuração do Serviço
          </p>
          <ServiceForm initialData={service} initialSite={site} />
        </div>

        {/* Zona de perigo */}
        <div className="bib-card mt-4 border-red-100">
          <p className="text-xs font-semibold text-red-500 mb-3 uppercase tracking-wide">
            Zona de Perigo
          </p>
          <DeleteServiceButton serviceId={service.id} serviceName={service.name} />
        </div>
      </div>
    </div>
  );
}
