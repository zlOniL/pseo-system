import Link from 'next/link';
import { notFound } from 'next/navigation';
import { api } from '@/lib/api';
import SiteForm from '../../_components/SiteForm';

export const dynamic = 'force-dynamic';

export default async function EditSitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const site = await api.getSite(id).catch(() => null);
  if (!site) notFound();

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href={`/sites/${site.id}`} className="bib-back">← {site.name}</Link>
        <div className="bib-page-header">
          <div>
            <h1 className="bib-title">Editar Site</h1>
            <p className="bib-subtitle">Configuração da integração</p>
          </div>
        </div>
        <div className="bib-card">
          <SiteForm initialData={site} />
        </div>
      </div>
    </div>
  );
}
