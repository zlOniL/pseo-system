'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { FtpConnectionTestResult, Site, UpsertFtpSiteConfigInput } from '@/lib/types';

export default function SiteForm({ initialData }: { initialData?: Site }) {
  const router = useRouter();
  const isEdit = !!initialData;
  const [name, setName] = useState(initialData?.name ?? '');
  const [domain, setDomain] = useState(initialData?.domain ?? '');
  const [integrationType, setIntegrationType] = useState<Site['integration_type']>(
    initialData?.integration_type ?? 'whitelabel_api',
  );
  const [apiToken, setApiToken] = useState('');
  const [wordpressBaseUrl, setWordpressBaseUrl] = useState(initialData?.wordpress_base_url ?? '');
  const [wordpressSecret, setWordpressSecret] = useState('');
  const [ftpHost, setFtpHost] = useState('');
  const [ftpPort, setFtpPort] = useState('21');
  const [ftpSecurityMode, setFtpSecurityMode] = useState<'plain' | 'explicit_tls'>('plain');
  const [ftpUsername, setFtpUsername] = useState('');
  const [ftpPassword, setFtpPassword] = useState('');
  const [ftpRemoteRoot, setFtpRemoteRoot] = useState('public_html');
  const [ftpBackupRoot, setFtpBackupRoot] = useState('backups/pseo');
  const [ftpPublicBaseUrl, setFtpPublicBaseUrl] = useState(
    initialData?.domain ? `https://${initialData.domain}` : '',
  );
  const [ftpPassiveMode, setFtpPassiveMode] = useState(true);
  const [hasFtpPassword, setHasFtpPassword] = useState(false);
  const [ftpConnectionStatus, setFtpConnectionStatus] = useState<'untested' | 'ok' | 'failed'>('untested');
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!initialData?.id) return;
    if (initialData.integration_type !== 'ftp_html') return;

    api.getFtpSiteConfig(initialData.id)
      .then((config) => {
        if (!config) return;
        setFtpHost(config.host);
        setFtpPort(String(config.port));
        setFtpSecurityMode(config.security_mode);
        setFtpUsername(config.username);
        setFtpRemoteRoot(config.remote_root);
        setFtpBackupRoot(config.backup_root);
        setFtpPublicBaseUrl(config.public_base_url);
        setFtpPassiveMode(config.passive_mode);
        setHasFtpPassword(config.has_ftp_password);
        setFtpConnectionStatus(config.connection_status);
      })
      .catch((err) => toast.error((err as Error).message));
  }, [initialData?.id, initialData?.integration_type]);

  function ftpPayload(): UpsertFtpSiteConfigInput {
    return {
      host: ftpHost.trim(),
      port: Number(ftpPort || 21),
      security_mode: ftpSecurityMode,
      username: ftpUsername.trim(),
      ...(ftpPassword.trim() && { password: ftpPassword.trim() }),
      remote_root: ftpRemoteRoot.trim(),
      backup_root: ftpBackupRoot.trim(),
      public_base_url: ftpPublicBaseUrl.trim(),
      passive_mode: ftpPassiveMode,
    };
  }

  function ftpErrorMessage(result: FtpConnectionTestResult): string {
    if (result.message) return result.message;
    if (result.code === 'dns') return 'DNS não resolveu o host FTP.';
    if (result.code === 'timeout') return 'Timeout ao conectar no FTP.';
    if (result.code === 'auth') return 'Credenciais FTP recusadas.';
    if (result.code === 'not_found') return 'Raiz remota não encontrada.';
    return 'Falha ao testar conexão FTP.';
  }

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

      if (integrationType === 'ftp_html') {
        const config = await api.upsertFtpSiteConfig(site.id, ftpPayload());
        setHasFtpPassword(config.has_ftp_password);
        setFtpConnectionStatus(config.connection_status);
        setFtpPassword('');
      }

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

  async function handleTestFtp() {
    if (!initialData?.id) {
      toast.error('Guarde o site antes de testar FTP.');
      return;
    }

    setTesting(true);
    setError('');
    try {
      const config = await api.upsertFtpSiteConfig(initialData.id, ftpPayload());
      setHasFtpPassword(config.has_ftp_password);
      setFtpPassword('');

      const result = await api.testFtpSiteConfig(initialData.id);
      setFtpConnectionStatus(result.ok ? 'ok' : 'failed');
      if (!result.ok) throw new Error(ftpErrorMessage(result));
      toast.success('Conexão FTP OK.');
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setTesting(false);
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
        <select className="bib-input" value={integrationType} onChange={(e) => setIntegrationType(e.target.value as Site['integration_type'])}>
          <option value="whitelabel_api">API Whitelabel</option>
          <option value="wordpress">WordPress</option>
          <option value="ftp_html">HTML via FTP</option>
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

      {integrationType === 'ftp_html' && (
        <div className="space-y-4 border-t border-gray-100 pt-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="bib-label">Host FTP</label>
              <input className="bib-input" value={ftpHost} onChange={(e) => setFtpHost(e.target.value)} placeholder="ftp.urgentreparacoes.pt" required />
            </div>

            <div>
              <label className="bib-label">Porta</label>
              <input className="bib-input" type="number" min={1} max={65535} value={ftpPort} onChange={(e) => setFtpPort(e.target.value)} required />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="bib-label">Segurança</label>
              <select className="bib-input" value={ftpSecurityMode} onChange={(e) => setFtpSecurityMode(e.target.value as 'plain' | 'explicit_tls')}>
                <option value="plain">FTP puro</option>
                <option value="explicit_tls">FTPS explícito</option>
              </select>
            </div>

            <div>
              <label className="bib-label">Usuário</label>
              <input className="bib-input" value={ftpUsername} onChange={(e) => setFtpUsername(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="bib-label">
              Senha FTP
              {hasFtpPassword && <span className="bib-label-hint"> já configurada; preencha apenas para substituir</span>}
            </label>
            <input className="bib-input" type="password" value={ftpPassword} onChange={(e) => setFtpPassword(e.target.value)} required={!hasFtpPassword} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="bib-label">Raiz remota</label>
              <input className="bib-input" value={ftpRemoteRoot} onChange={(e) => setFtpRemoteRoot(e.target.value)} required />
              <p className="mt-1 text-xs text-gray-400">
                Use public_html se o FTP mostra essa pasta. Use . se o login ja abre dentro do public_html.
              </p>
            </div>

            <div>
              <label className="bib-label">Pasta de backup</label>
              <input className="bib-input" value={ftpBackupRoot} onChange={(e) => setFtpBackupRoot(e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="bib-label">URL pública base</label>
            <input className="bib-input" value={ftpPublicBaseUrl} onChange={(e) => setFtpPublicBaseUrl(e.target.value)} placeholder="https://urgentreparacoes.pt" required />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={ftpPassiveMode} onChange={(e) => setFtpPassiveMode(e.target.checked)} />
            Modo passivo
          </label>

          {isEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" disabled={testing || loading} onClick={handleTestFtp} className="bib-btn bib-btn-secondary">
                {testing ? 'A testar...' : 'Testar conexão'}
              </button>
              <span className="text-xs text-gray-500">
                Estado: {ftpConnectionStatus === 'ok' ? 'OK' : ftpConnectionStatus === 'failed' ? 'falhou' : 'não testado'}
              </span>
            </div>
          )}
        </div>
      )}

      <button disabled={loading} className="bib-btn bib-btn-primary w-full py-2.5">
        {loading ? 'A guardar...' : 'Guardar Site'}
      </button>
    </form>
  );
}
