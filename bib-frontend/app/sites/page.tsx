import Link from 'next/link';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default async function SitesPage() {
  const sites = await api.listSites().catch(() => []);

  return (
    <div className="bib-page">
      <div className="bib-container">
        <div className="bib-page-header">
          <div>
            <h1 className="bib-title">Sites</h1>
            <p className="bib-subtitle">
              {sites.length} site{sites.length !== 1 ? 's' : ''} configurado{sites.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Link href="/sites/new" className="bib-btn bib-btn-primary">
            + Novo Site
          </Link>
        </div>

        {sites.length === 0 ? (
          <div className="bib-empty">
            <p>Nenhum site configurado ainda.</p>
            <Link href="/sites/new" className="mt-2 inline-block text-sm text-gray-700 underline">
              Criar primeiro site
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {sites.map((site) => (
              <Link key={site.id} href={`/sites/${site.id}`} className="bib-card block hover:border-gray-300 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{site.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{site.domain}</p>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {site.integration_type === 'whitelabel_api' ? 'API Whitelabel' : 'WordPress'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
