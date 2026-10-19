'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Content } from '@/lib/types';

export function HybridProvenance({ content }: { content: Content }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const regenerate = async () => {
    if (!content.service_id) return;
    setBusy(true);
    setError('');
    try {
      const draft = await api.regenerateHybridLocal(content.service_id, content.id);
      window.location.assign(`/contents/${draft.id}`);
    } catch (err) { setError((err as Error).message); setBusy(false); }
  };
  return <details className="shrink-0 border-b border-indigo-200 bg-indigo-50 px-5 py-2 text-xs">
    <summary className="cursor-pointer font-medium">Página Híbrida — origem das secções</summary>
    <div className="my-2 max-h-40 overflow-auto">{content.hybrid_manifest?.sections.map(section => <p key={section.section_key}>
      {section.section_key.replace(/^modulo_\d+_/, '').replaceAll('_', ' ')} · v{section.version} · {section.strategy === 'generic' ? 'Biblioteca reutilizada' : 'IA para esta localidade'}
    </p>)}</div>
    <button type="button" disabled={busy} onClick={regenerate} className="rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50">{busy ? 'A gerar contexto local…' : 'Criar rascunho com novo contexto local'}</button>
    <p className="mt-1">Mantém as mesmas secções genéricas. A página atual permanece disponível.</p>
    {error && <p role="alert" className="mt-1 text-red-700">{error}</p>}
  </details>;
}
