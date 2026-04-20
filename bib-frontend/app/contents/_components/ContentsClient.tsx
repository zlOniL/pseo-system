'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { ContentSummary, Service } from '@/lib/types';
import { ContentRow } from './ContentRow';

interface ContentsClientProps {
  contents: ContentSummary[];
  services: Service[];
  activeFilters: { status?: string; service?: string; city?: string };
}

export default function ContentsClient({ contents, services, activeFilters }: ContentsClientProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams({
      ...(activeFilters.status ? { status: activeFilters.status } : {}),
      ...(activeFilters.service ? { service: activeFilters.service } : {}),
      ...(activeFilters.city ? { city: activeFilters.city } : {}),
    });
    if (value) params.set(key, value);
    else params.delete(key);
    startTransition(() => {
      router.push(`/contents?${params.toString()}`);
    });
  }

  function toggleAll() {
    if (selectedIds.size === contents.length && contents.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(contents.map((c) => c.id)));
    }
  }

  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    const ids = [...selectedIds].filter(
      (id) => contents.find((c) => c.id === id)?.status === 'draft',
    );
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      await api.bulkApprove(ids);
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const confirmed = window.confirm(
      `Apagar ${ids.length} conteúdo${ids.length !== 1 ? 's' : ''}? Esta acção não pode ser desfeita.`,
    );
    if (!confirmed) return;
    setBulkLoading(true);
    try {
      const result = await api.bulkDelete(ids);
      setSelectedIds(new Set());
      router.refresh();
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkPublish() {
    const ids = [...selectedIds].filter(
      (id) => contents.find((c) => c.id === id)?.status === 'approved',
    );
    if (ids.length === 0) return;
    setBulkLoading(true);
    setBulkProgress(0);
    setBulkTotal(ids.length);

    const CHUNK_SIZE = 50;
    let processed = 0;

    for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
      const chunk = ids.slice(i, i + CHUNK_SIZE);
      try {
        await api.bulkPublish(chunk);
      } catch {
        // continua nos chunks seguintes
      }
      processed += chunk.length;
      setBulkProgress(processed);
    }

    setBulkLoading(false);
    setSelectedIds(new Set());
    router.refresh();
  }

  const selectedList = [...selectedIds];
  const canApprove = selectedList.some(
    (id) => contents.find((c) => c.id === id)?.status === 'draft',
  );
  const canPublish = selectedList.some(
    (id) => contents.find((c) => c.id === id)?.status === 'approved',
  );
  const canDelete = selectedList.length > 0;

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={activeFilters.status ?? ''}
          onChange={(e) => updateFilter('status', e.target.value)}
          className="bib-input w-auto"
        >
          <option value="">Todos os estados</option>
          <option value="draft">Rascunho</option>
          <option value="approved">Aprovado</option>
          <option value="published">Publicado</option>
        </select>

        <select
          value={activeFilters.service ?? ''}
          onChange={(e) => updateFilter('service', e.target.value)}
          className="bib-input w-auto"
        >
          <option value="">Todos os serviços</option>
          {services.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Filtrar por cidade..."
          value={activeFilters.city ?? ''}
          onChange={(e) => updateFilter('city', e.target.value)}
          className="bib-input w-44"
        />

        {(activeFilters.status || activeFilters.service || activeFilters.city) && (
          <button
            onClick={() => router.push('/contents')}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 bg-gray-900 text-white rounded-xl px-4 py-3 mb-4">
          <span className="text-sm font-medium">
            {selectedIds.size} selecionado{selectedIds.size !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />

          {bulkLoading ? (
            <span className="text-sm text-gray-300">
              A publicar... {bulkProgress}/{bulkTotal}
            </span>
          ) : (
            <>
              {canApprove && (
                <button
                  onClick={handleBulkApprove}
                  className="text-sm px-3 py-1.5 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Aprovar selecionados
                </button>
              )}
              {canPublish && (
                <button
                  onClick={handleBulkPublish}
                  className="text-sm px-3 py-1.5 border border-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
                >
                  Publicar selecionados
                </button>
              )}
              {canDelete && (
                <button
                  onClick={handleBulkDelete}
                  className="text-sm px-3 py-1.5 border border-red-500 text-red-400 rounded-lg hover:bg-red-900/30 transition-colors"
                >
                  Apagar selecionados
                </button>
              )}
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      )}

      {/* Lista */}
      {contents.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-sm">Nenhum conteúdo encontrado.</p>
          <Link href="/generate" className="text-sm text-gray-900 underline mt-1 inline-block">
            Gerar agora
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Select all header */}
          <label className="flex items-center gap-3 px-1 mb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.size === contents.length && contents.length > 0}
              onChange={toggleAll}
              className="w-4 h-4 accent-gray-900"
            />
            <span className="text-xs text-gray-500">
              {selectedIds.size === contents.length && contents.length > 0
                ? 'Desselecionar todos'
                : 'Selecionar todos'}
            </span>
          </label>

          {contents.map((c) => (
            <ContentRow
              key={c.id}
              content={c}
              isSelected={selectedIds.has(c.id)}
              onToggle={() => toggleOne(c.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
