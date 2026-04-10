import Link from 'next/link';
import ServiceForm from '../_components/ServiceForm';

export default function NewServicePage() {
  return (
    <div className="bib-page">
      <div className="bib-container">
        <Link href="/services" className="bib-back">← Serviços</Link>
        <h1 className="bib-title mb-6">Novo Serviço</h1>

        <div className="bib-card">
          <ServiceForm />
        </div>
      </div>
    </div>
  );
}
