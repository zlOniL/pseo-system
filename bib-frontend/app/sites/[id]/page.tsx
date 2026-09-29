import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import SiteActions from './site-actions';
import { Site } from '@/lib/types';

export const dynamic = 'force-dynamic';

function integrationLabel(type: Site['integration_type']): string {
  if (type === 'whitelabel_api') return 'API Whitelabel';
  if (type === 'ftp_html') return 'HTML via FTP';
  return 'WordPress';
}

function credentialLabel(site: Site): string {
  if (site.integration_type === 'wordpress') {
    return `Secret ${site.has_wordpress_secret ? 'configurado' : 'não configurado'}`;
  }
  if (site.integration_type === 'ftp_html') return 'Configuração FTP no formulário';
  return `Token ${site.has_api_token ? 'configurado' : 'não configurado'}`;
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await api.getSite(id).catch(() => null);
  if (!site) notFound();

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href="/sites" className="bib-back">← Sites</Link>
        <div className="bib-page-header">
          <div>
            <h1 className="bib-title">{site.name}</h1>
            <p className="bib-subtitle">{site.domain} · {integrationLabel(site.integration_type)}</p>
          </div>
          <Link href={`/services/new?site_id=${site.id}`} className="bib-btn bib-btn-primary">
            + Criar Serviço
          </Link>
        </div>

        <div className="grid gap-4">
          <div className="bib-card space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Integração</p>
                <p className="text-xs text-gray-400">
                  {credentialLabel(site)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/sites/${site.id}/edit`} className="bib-btn bib-btn-secondary text-xs">
                  Editar integração
                </Link>
                {site.integration_type === 'whitelabel_api' && <SiteActions siteId={site.id} />}
              </div>
            </div>
          </div>

          <div className="bib-card flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Serviços deste site</p>
              <p className="text-xs text-gray-400">Gerir serviços, templates e escala filtrados por site.</p>
            </div>
            <Link href={`/services?site_id=${site.id}`} className="bib-btn bib-btn-secondary">
              Ver Serviços
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
