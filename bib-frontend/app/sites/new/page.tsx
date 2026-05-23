import SiteForm from '../_components/SiteForm';

export default function NewSitePage() {
  return (
    <div className="bib-page">
      <div className="bib-container">
        <div className="bib-page-header">
          <div>
            <h1 className="bib-title">Novo Site</h1>
            <p className="bib-subtitle">Configuração inicial da integração</p>
          </div>
        </div>
        <div className="bib-card">
          <SiteForm />
        </div>
      </div>
    </div>
  );
}
