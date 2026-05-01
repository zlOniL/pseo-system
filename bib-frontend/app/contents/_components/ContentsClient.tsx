'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { PaginatedContents, Service } from '@/lib/types';
import { ContentRow } from './ContentRow';

const LIMIT_OPTIONS = [10, 25, 50, 100, 250, 500, 1000];
const DEFAULT_LIMIT = 10;

function parseLimit(raw: string): number {
  const n = Number(raw);
  return LIMIT_OPTIONS.includes(n) ? n : DEFAULT_LIMIT;
}

interface ContentsClientProps {
  services: Service[];
}

export default function ContentsClient({ services }: ContentsClientProps) {
  // Estado local puro — sem leitura de URL nem sincronização com router
  const [status, setStatus] = useState('');
  const [service, setService] = useState('');
  const [city, setCity] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_LIMIT);
  const cityTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [result, setResult] = useState<PaginatedContents>({ data: [], total: 0, page: 1, limit: DEFAULT_LIMIT });
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  function refresh() { setRefreshTick((t) => t + 1); }

  // ── Selecção em massa ─────────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [bulkStatusMsg, setBulkStatusMsg] = useState('A publicar...');

  // ── Fetch de dados sempre que os filtros locais mudam ─────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listContents({
        status: status || undefined,
        service: service || undefined,
        city: city || undefined,
        page,
        limit,
      })
      .then((data) => { if (!cancelled) setResult(data); })
      .catch(() => { if (!cancelled) setResult({ data: [], total: 0, page: 1, limit }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [status, service, city, page, limit, refreshTick]);

  // Limpa selecção quando os filtros mudam
  useEffect(() => {
    setSelectedIds(new Set());
  }, [status, service, city, page, limit]);

  // ── Handlers de filtros ───────────────────────────────────────────────────────

  function applyStatus(value: string) {
    setStatus(value);
    setPage(1);
  }

  function applyService(value: string) {
    setService(value);
    setPage(1);
  }

  function applyLimit(value: string) {
    setLimit(parseLimit(value));
    setPage(1);
  }

  function handleCityChange(value: string) {
    setCityInput(value);
    clearTimeout(cityTimerRef.current);
    cityTimerRef.current = setTimeout(() => {
      setCity(value);
      setPage(1);
    }, 600);
  }

  function clearFilters() {
    clearTimeout(cityTimerRef.current);
    setStatus('');
    setService('');
    setCity('');
    setCityInput('');
    setPage(1);
  }

  function goToPage(p: number) { setPage(p); }

  // ── Acções em massa ───────────────────────────────────────────────────────────

  function toggleAll() {
    if (selectedIds.size === result.data.length && result.data.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(result.data.map((c) => c.id)));
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
      (id) => result.data.find((c) => c.id === id)?.status === 'draft',
    );
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      await api.bulkApprove(ids);
      setSelectedIds(new Set());
      toast.success(`${ids.length} página${ids.length !== 1 ? 's' : ''} aprovada${ids.length !== 1 ? 's' : ''}.`);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  async function performBulkDelete(ids: string[]) {
    setBulkLoading(true);
    try {
      await api.bulkDelete(ids);
      setSelectedIds(new Set());
      toast.success(`${ids.length} conteúdo${ids.length !== 1 ? 's' : ''} apagado${ids.length !== 1 ? 's' : ''}.`);
      refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBulkLoading(false);
    }
  }

  function handleBulkDelete() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    toast(`Apagar ${ids.length} conteúdo${ids.length !== 1 ? 's' : ''}? Esta acção não pode ser desfeita.`, {
      action: { label: 'Confirmar', onClick: () => performBulkDelete(ids) },
      cancel: { label: 'Cancelar', onClick: () => {} },
      duration: 10000,
    });
  }

  async function handleBulkPublish() {
    const ids = [...selectedIds].filter(
      (id) => result.data.find((c) => c.id === id)?.status === 'approved',
    );
    if (ids.length === 0) return;

    setBulkLoading(true);
    setBulkProgress(0);
    setBulkTotal(ids.length);
    setBulkStatusMsg('A publicar...');

    const CHUNK_SIZE = 50;
    let published = 0;
    let failedIds: string[] = [];

    async function runPass(passIds: string[]) {
      for (let i = 0; i < passIds.length; i += CHUNK_SIZE) {
        const chunk = passIds.slice(i, i + CHUNK_SIZE);
        try {
          const results = await api.bulkPublish(chunk);
          const returned = new Set(results.map((r) => r.id));
          for (const r of results) {
            if (r.success) published++;
            else failedIds.push(r.id);
          }
          for (const id of chunk) {
            if (!returned.has(id)) failedIds.push(id);
          }
        } catch {
          failedIds.push(...chunk);
        }
        setBulkProgress(Math.min(i + CHUNK_SIZE, passIds.length));
      }
    }

    await runPass(ids);

    if (failedIds.length > 0) {
      const retryIds = [...failedIds];
      failedIds = [];
      setBulkStatusMsg(`A re-tentar ${retryIds.length} página${retryIds.length !== 1 ? 's' : ''}...`);
      setBulkProgress(0);
      setBulkTotal(retryIds.length);
      await runPass(retryIds);
    }

    setBulkLoading(false);
    setSelectedIds(new Set());

    if (failedIds.length === 0) {
      toast.success(`${published} página${published !== 1 ? 's' : ''} publicada${published !== 1 ? 's' : ''}.`);
    } else {
      toast.warning(
        `${published} publicada${published !== 1 ? 's' : ''}, ${failedIds.length} falharam após retry.`,
      );
    }

    refresh();
  }

  const selectedList = [...selectedIds];
  const canApprove = selectedList.some((id) => result.data.find((c) => c.id === id)?.status === 'draft');
  const canPublish = selectedList.some((id) => result.data.find((c) => c.id === id)?.status === 'approved');
  const canDelete = selectedList.length > 0;
  const totalPages = Math.max(1, Math.ceil(result.total / limit));

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <select
          value={status}
          onChange={(e) => applyStatus(e.target.value)}
          className="bib-input w-auto"
        >
          <option value="">Todos os estados</option>
          <option value="draft">Rascunho</option>
          <option value="approved">Aprovado</option>
          <option value="published">Publicado</option>
        </select>

        <select
          value={service}
          onChange={(e) => applyService(e.target.value)}
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
          value={cityInput}
          onChange={(e) => handleCityChange(e.target.value)}
          className="bib-input w-44"
        />

        <select
          value={String(limit)}
          onChange={(e) => applyLimit(e.target.value)}
          className="bib-input w-auto"
        >
          {LIMIT_OPTIONS.map((n) => (
            <option key={n} value={String(n)}>{n} por página</option>
          ))}
        </select>

        {(status || service || city) && (
          <button
            onClick={clearFilters}
            className="text-xs text-gray-400 hover:text-gray-700 underline"
          >
            Limpar filtros
          </button>
        )}

        {!loading && (
          <span className="text-xs text-gray-400 ml-auto">
            {result.total} página{result.total !== 1 ? 's' : ''} no total
          </span>
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
              {bulkStatusMsg} {bulkProgress}/{bulkTotal}
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
      <div className={loading ? 'opacity-50 pointer-events-none' : ''}>
        {result.data.length === 0 && !loading ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-sm">Nenhum conteúdo encontrado.</p>
            <Link href="/generate" className="text-sm text-gray-900 underline mt-1 inline-block">
              Gerar agora
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="flex items-center gap-3 px-1 mb-1 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.size === result.data.length && result.data.length > 0}
                onChange={toggleAll}
                className="w-4 h-4 accent-gray-900"
              />
              <span className="text-xs text-gray-500">
                {selectedIds.size === result.data.length && result.data.length > 0
                  ? 'Desselecionar todos'
                  : 'Selecionar todos'}
              </span>
            </label>

            {result.data.map((c) => (
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

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 mt-6">
          <button
            onClick={() => goToPage(1)}
            disabled={page === 1}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            «
          </button>
          <button
            onClick={() => goToPage(page - 1)}
            disabled={page === 1}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ‹
          </button>

          <PageNumbers page={page} totalPages={totalPages} goToPage={goToPage} />

          <button
            onClick={() => goToPage(page + 1)}
            disabled={page === totalPages}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ›
          </button>
          <button
            onClick={() => goToPage(totalPages)}
            disabled={page === totalPages}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            »
          </button>
        </div>
      )}
    </div>
  );
}

function PageNumbers({
  page,
  totalPages,
  goToPage,
}: {
  page: number;
  totalPages: number;
  goToPage: (p: number) => void;
}) {
  const btnClass = (active: boolean) =>
    `min-w-[28px] px-2 py-1 text-xs rounded transition-colors ${
      active
        ? 'bg-gray-900 text-white font-medium'
        : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
    }`;

  const pages: (number | 'ellipsis')[] = [];

  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 4) pages.push('ellipsis');
    const start = Math.max(2, page - 2);
    const end = Math.min(totalPages - 1, page + 2);
    for (let i = start; i <= end; i++) pages.push(i);
    if (page < totalPages - 3) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <>
      {pages.map((p, i) =>
        p === 'ellipsis' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-xs text-gray-400">
            …
          </span>
        ) : (
          <button key={p} onClick={() => goToPage(p)} className={btnClass(p === page)}>
            {p}
          </button>
        ),
      )}
    </>
  );
}
