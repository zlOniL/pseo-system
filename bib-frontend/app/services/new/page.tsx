import Link from 'next/link';
import { redirect } from 'next/navigation';
import { api } from '@/lib/api';
import ServiceForm from '../_components/ServiceForm';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const siteId = resolvedSearchParams?.site_id;

  if (!siteId) {
    const sites = await api.listSites().catch(() => []);
    if (sites[0]?.id) redirect(`/services/new?site_id=${sites[0].id}`);
  }

  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href={`/services${siteId ? `?site_id=${siteId}` : ''}`} className="bib-back">← Serviços</Link>
        <h1 className="bib-title mb-6">Novo Serviço</h1>

        <div className="bib-card">
          <ServiceForm siteId={siteId} />
        </div>
      </div>
    </div>
  );
}
