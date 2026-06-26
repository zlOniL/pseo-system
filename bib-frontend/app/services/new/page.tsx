import Link from 'next/link';
import ServiceForm from '../_components/ServiceForm';

export default async function NewServicePage({
  searchParams,
}: {
  searchParams?: Promise<{ site_id?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const siteId = resolvedSearchParams?.site_id;

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
