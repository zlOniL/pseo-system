'use client';

import { useEffect, useState } from 'react';
import { api, HybridSummary } from '@/lib/api';

export function HybridPanel({ serviceId, onReady }: { serviceId: string; onReady: (ready: boolean) => void }) {
  const [summary, setSummary] = useState<HybridSummary | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setSummary(null);
    setError('');
    onReady(false);
    const refresh = async () => {
      if (!serviceId) return;
      try {
        const next = await api.getHybridSummary(serviceId);
        if (!active) return;
        setSummary(next);
        onReady(next.ready && !next.preparing);
        setError(next.error ?? '');
      } catch (err) {
        if (active) { setError((err as Error).message); onReady(false); }
      }
    };
    void refresh();
    const timer = setInterval(refresh, 4000);
    return () => { active = false; clearInterval(timer); };
  }, [serviceId, onReady]);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    onReady(false);
    try {
      await action();
      const next = await api.getHybridSummary(serviceId);
      setSummary(next);
      onReady(next.ready && !next.preparing);
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  };

  return <div className="space-y-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs">
    <p className="font-semibold text-indigo-950">Híbrido: biblioteca + contexto local por IA</p>
    <p>As versões genéricas são sorteadas. Secções com factos geográficos são geradas para cada localidade, com referências verificadas.</p>
    <button type="button" disabled={!serviceId || busy || summary?.preparing} onClick={() => act(() => api.prepareHybrid(serviceId))} className="rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50">
      {summary?.preparing ? 'A preparar a biblioteca…' : 'Preparar versões pendentes'}
    </button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {summary && <>
      <p>{summary.ready ? 'Biblioteca preparada.' : 'Prepare pelo menos uma versão de cada secção.'} {summary.sections.filter(s => s.generic > 0).length} secções com versões reutilizáveis; {summary.sections.filter(s => s.local > 0).length} com versões locais.</p>
      <details><summary className="cursor-pointer font-medium">Rever estratégias por secção</summary>
        <div className="mt-2 max-h-64 space-y-2 overflow-auto">{summary.sections.map(section => <div key={section.section_key} className="rounded bg-white p-2">
          <p className="font-medium">{section.section_key.replace(/^modulo_\d+_/, '').replaceAll('_', ' ')}</p>
          {!section.versions.length && <p className="text-amber-700">Sem versões. Crie ou reextraia um template completo.</p>}
          {section.versions.map(version => <div key={version.id} className="mt-1">
            <span>v{version.version}: {version.strategy === 'generic' ? 'Reutilizável' : version.strategy === 'local' ? 'Local por IA' : 'Por preparar'}</span>
            <p className="text-gray-500">{version.reason}</p>
            {version.strategy !== 'local' && <button disabled={busy || summary.preparing} type="button" className="text-indigo-700 underline" onClick={() => act(() => api.markHybridLocal(serviceId, version.id))}>Gerar esta versão por IA</button>}
          </div>)}
        </div>)}</div>
      </details>
    </>}
  </div>;
}
