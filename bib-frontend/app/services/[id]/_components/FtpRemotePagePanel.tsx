'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  FtpRemotePageCheckResult,
  FtpRemotePageImportResult,
} from '@/lib/types';

export default function FtpRemotePagePanel({
  serviceId,
  defaultRemotePath,
}: {
  serviceId: string;
  defaultRemotePath: string;
}) {
  const [remotePath, setRemotePath] = useState(defaultRemotePath);
  const [checking, setChecking] = useState(false);
  const [importing, setImporting] = useState(false);
  const [checkResult, setCheckResult] =
    useState<FtpRemotePageCheckResult | null>(null);
  const [importResult, setImportResult] =
    useState<FtpRemotePageImportResult | null>(null);

  async function checkRemotePage() {
    setChecking(true);
    setImportResult(null);
    try {
      const result = await api.checkFtpRemotePage(serviceId, {
        remote_path: remotePath.trim() || undefined,
      });
      setCheckResult(result);
      if (result.status === 'found') toast.success('Página remota encontrada.');
      if (result.status === 'not_found') toast.error('Página remota não encontrada.');
      if (result.status === 'unavailable') toast.error(result.error ?? 'FTP indisponível.');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setChecking(false);
    }
  }

  async function importRemotePage() {
    setImporting(true);
    try {
      const result = await api.importFtpRemotePage(serviceId, {
        remote_path: remotePath.trim() || undefined,
      });
      setImportResult(result);
      if (result.status === 'imported') toast.success('Template FTP importado.');
      if (result.status === 'manual_boundary_required') {
        toast.error('Fronteiras do template exigem revisão manual.');
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  const canImport = checkResult?.status === 'found';

  return (
    <div className="bib-card mb-4 space-y-4">
      <div>
        <p className="text-sm font-medium text-gray-900">Página HTML remota</p>
        <p className="text-xs text-gray-400 mt-0.5">
          Verificação e importação do template FTP, sem escrita no servidor.
        </p>
      </div>

      <div>
        <label className="bib-label">Caminho remoto</label>
        <input
          className="bib-input"
          value={remotePath}
          onChange={(event) => {
            setRemotePath(event.target.value);
            setCheckResult(null);
            setImportResult(null);
          }}
          placeholder={defaultRemotePath}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="bib-btn bib-btn-secondary"
          disabled={checking || importing}
          onClick={checkRemotePage}
        >
          {checking ? 'A verificar...' : 'Verificar'}
        </button>
        <button
          type="button"
          className="bib-btn bib-btn-primary"
          disabled={!canImport || checking || importing}
          onClick={importRemotePage}
        >
          {importing ? 'A importar...' : 'Importar como template'}
        </button>
      </div>

      {checkResult && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <p>Status: {checkResult.status}</p>
          {checkResult.attempted_ftp_path && (
            <p>FTP: {checkResult.attempted_ftp_path}</p>
          )}
          {checkResult.attempted_ftp_directory && (
            <p>Pasta listada: {checkResult.attempted_ftp_directory}</p>
          )}
          {checkResult.public_url && <p>URL: {checkResult.public_url}</p>}
          {checkResult.size !== undefined && <p>Tamanho: {checkResult.size} bytes</p>}
          {checkResult.error && <p>Erro: {checkResult.error}</p>}
        </div>
      )}

      {importResult && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          <p>Importação: {importResult.status}</p>
          {importResult.template_version && (
            <p>Versão: {importResult.template_version.version}</p>
          )}
          {importResult.remote_page.last_seen_hash && (
            <p>Hash: {importResult.remote_page.last_seen_hash}</p>
          )}
          {importResult.boundary_issue && (
            <p>Fronteira: {importResult.boundary_issue}</p>
          )}
        </div>
      )}
    </div>
  );
}
