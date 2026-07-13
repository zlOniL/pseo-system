'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Site } from '@/lib/types';

export default function SiteForm({ initialData }: { initialData?: Site }) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name ?? '');
  const [domain, setDomain] = useState(initialData?.domain ?? '');
  const [integrationType, setIntegrationType] = useState<'wordpress' | 'whitelabel_api'>(
    initialData?.integration_type ?? 'whitelabel_api',
  );
  const [apiToken, setApiToken] = useState('');
  const [wordpressBaseUrl, setWordpressBaseUrl] = useState(initialData?.wordpress_base_url ?? '');
  const [wordpressSecret, setWordpressSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = {
        name: name.trim(),
        domain: domain.trim(),
        integration_type: integrationType,
        ...(integrationType === 'whitelabel_api' && apiToken.trim() && { api_token: apiToken.trim() }),
        ...(integrationType === 'wordpress' && {
          wordpress_base_url: wordpressBaseUrl.trim() || `https://${domain.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`,
          ...(wordpressSecret.trim() && { wordpress_secret: wordpressSecret.trim() }),
        }),
      };
      const site = isEdit && initialData
        ? await api.updateSite(initialData.id, payload)
        : await api.createSite(payload);
      toast.success('Site guardado.');
      router.push(`/sites/${site.id}`);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <p className="bib-error">{error}</p>}

      <div>
        <label className="bib-label">Nome visível</label>
        <input className="bib-input" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>

      <div>
        <label className="bib-label">Domínio</label>
        <input className="bib-input" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="canalizadorurgente24horas.pt" required />
      </div>

      <div>
        <label className="bib-label">Integração</label>
        <select className="bib-input" value={integrationType} onChange={(e) => setIntegrationType(e.target.value as 'wordpress' | 'whitelabel_api')}>
          <option value="whitelabel_api">API Whitelabel</option>
          <option value="wordpress">WordPress</option>
        </select>
      </div>

      {integrationType === 'whitelabel_api' && (
        <div>
          <label className="bib-label">
            Token da API
            {initialData?.has_api_token && <span className="bib-label-hint"> já configurado; preencha apenas para substituir</span>}
          </label>
          <input className="bib-input" type="password" value={apiToken} onChange={(e) => setApiToken(e.target.value)} required={!initialData?.has_api_token} />
        </div>
      )}

      {integrationType === 'wordpress' && (
        <>
          <div>
            <label className="bib-label">URL base WordPress</label>
            <input
              className="bib-input"
              value={wordpressBaseUrl}
              onChange={(e) => setWordpressBaseUrl(e.target.value)}
              placeholder="https://exemplo.pt"
            />
          </div>

          <div>
            <label className="bib-label">
              Secret do plugin
              {initialData?.has_wordpress_secret && <span className="bib-label-hint"> já configurado; preencha apenas para substituir</span>}
            </label>
            <input
              className="bib-input"
              type="password"
              value={wordpressSecret}
              onChange={(e) => setWordpressSecret(e.target.value)}
              required={!initialData?.has_wordpress_secret}
            />
          </div>
        </>
      )}

      <button disabled={loading} className="bib-btn bib-btn-primary w-full py-2.5">
        {loading ? 'A guardar...' : 'Guardar Site'}
      </button>
    </form>
  );
}
