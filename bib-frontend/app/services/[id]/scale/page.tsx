'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { QueueItem, QueueStats, RegionWithCities, Service } from '@/lib/types';

type CityStatus = 'done' | 'processing' | 'pending' | 'failed' | 'free';
type StatusFilter = 'all' | 'free' | 'failed' | 'done';

function getCityStatus(city: string, itemMap: Map<string, QueueItem>): CityStatus {
  const item = itemMap.get(city);
  if (!item) return 'free';
  return item.status === 'done'
    ? 'done'
    : item.status === 'processing'
      ? 'processing'
      : item.status === 'failed'
        ? 'failed'
        : 'pending';
}

function StatusBadge({ status }: { status: CityStatus }) {
  if (status === 'done')
    return <span className="text-emerald-500 text-sm">✓</span>;
  if (status === 'processing')
    return <span className="text-amber-500 text-sm animate-pulse">⏳</span>;
  if (status === 'pending')
    return <span className="text-gray-400 text-sm">⏸</span>;
  if (status === 'failed')
    return <span className="text-red-400 text-sm">✗</span>;
  return null;
}

function matchesFilter(status: CityStatus, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  return status === filter;
}

function isSelectable(status: CityStatus): boolean {
  return status === 'free' || status === 'failed' || status === 'done';
}

export default function ScalePage() {
  const params = useParams<{ id: string }>();
  const serviceId = params.id;

  const [service, setService] = useState<Service | null>(null);
  const [regions, setRegions] = useState<RegionWithCities[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [mode, setMode] = useState<'ai' | 'template'>('ai');
  const [enqueueing, setEnqueueing] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const poll = useCallback(() => {
    void api.getQueueForService(serviceId).then(setQueueItems).catch(() => { });
    void api.getQueueStats().then(setStats).catch(() => { });
  }, [serviceId]);

  useEffect(() => {
    Promise.all([
      api.getService(serviceId),
      api.getCities(),
      api.getQueueForService(serviceId),
      api.getQueueStats(),
    ])
      .then(([svc, r, q, s]) => {
        setService(svc);
        setRegions(r);
        // Start with all regions collapsed
        setExpandedRegions(new Set());
        setQueueItems(q);
        setStats(s);
      })
      .catch(() => setError('Erro ao carregar dados.'))
      .finally(() => setLoading(false));

    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [serviceId, poll]);

  const itemMap = new Map<string, QueueItem>(queueItems.map((q) => [q.city, q]));

  function toggleCity(city: string, status: CityStatus) {
    if (!isSelectable(status)) return;
    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  }

  function toggleRegionExpand(regionName: string) {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionName)) next.delete(regionName);
      else next.add(regionName);
      return next;
    });
  }

  function toggleRegion(region: RegionWithCities) {
    const selectableCities = region.cities.filter((c) => {
      const s = getCityStatus(c, itemMap);
      return isSelectable(s) && matchesFilter(s, statusFilter);
    });
    const allSelected =
      selectableCities.length > 0 && selectableCities.every((c) => selectedCities.has(c));

    setSelectedCities((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        selectableCities.forEach((c) => next.delete(c));
      } else {
        selectableCities.forEach((c) => next.add(c));
      }
      return next;
    });
  }

  async function handleEnqueue() {
    if (selectedCities.size === 0) return;
    setEnqueueing(true);
    setError('');
    try {
      await api.enqueue({ service_id: serviceId, cities: [...selectedCities], mode });
      setSelectedCities(new Set());
      poll();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setEnqueueing(false);
    }
  }

  if (loading) {
    return (
      <div className="bib-page flex items-center justify-center">
        <span className="text-sm text-gray-400">A carregar...</span>
      </div>
    );
  }

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'free', label: 'Pendentes' },
    { value: 'failed', label: 'Falhados' },
    { value: 'done', label: 'Concluídos' },
  ];

  return (
    <div className="bib-page">
      <div className="bib-container-wide">
        {/* Header */}
        <div className="flex items-center gap-2 mb-6">
          <Link href={`/services/${serviceId}`} className="bib-back" style={{ marginBottom: 0 }}>
            ← {service?.name ?? 'Serviço'}
          </Link>
          <span className="text-gray-300 text-xs">/</span>
          <span className="text-xs text-gray-600 font-medium">Geração em Escala</span>
        </div>

        {error && <p className="bib-error mb-4">{error}</p>}

        <div className="flex gap-6">
          {/* Painel esquerdo: seleção de cidades */}
          <div className="w-72 shrink-0">
            <div className="sticky top-0">
              {/* Header + Limpar */}
              <div className="flex items-center justify-between mb-2">
                <h2 className="bib-title" style={{ fontSize: '0.875rem' }}>Regiões e Cidades</h2>
                {selectedCities.size > 0 && (
                  <button
                    onClick={() => setSelectedCities(new Set())}
                    className="bib-btn bib-btn-ghost text-xs"
                  >
                    Limpar ({selectedCities.size})
                  </button>
                )}
              </div>

              {/* Filtro de estado */}
              <div className="flex gap-1 mb-2">
                {filterOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatusFilter(opt.value)}
                    className={`flex-1 text-xs py-1 rounded-md border font-medium transition-colors ${statusFilter === opt.value
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Lista de regiões */}
              <div className="space-y-3 max-h-[calc(100vh-380px)] overflow-y-auto pr-1">
                {regions.map((region) => {
                  const visibleCities = region.cities.filter((c) => {
                    const s = getCityStatus(c, itemMap);
                    return matchesFilter(s, statusFilter);
                  });

                  if (visibleCities.length === 0) return null;

                  const selectableCities = visibleCities.filter((c) =>
                    isSelectable(getCityStatus(c, itemMap)),
                  );
                  const allSelected =
                    selectableCities.length > 0 &&
                    selectableCities.every((c) => selectedCities.has(c));
                  const someSelected = selectableCities.some((c) => selectedCities.has(c));
                  const isExpanded = expandedRegions.has(region.region);

                  return (
                    <div key={region.region}>
                      {/* Região */}
                      <div className="flex items-center gap-2 mb-1">
                        <label className="flex items-center gap-2 cursor-pointer group flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = someSelected && !allSelected;
                            }}
                            onChange={() => toggleRegion(region)}
                            disabled={selectableCities.length === 0}
                            className="w-3.5 h-3.5 accent-gray-900"
                          />
                          <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900 uppercase tracking-wide">
                            {region.region}
                          </span>
                          <span className="text-xs text-gray-400">
                            ({visibleCities.length})
                          </span>
                        </label>
                        <button
                          onClick={() => toggleRegionExpand(region.region)}
                          className="shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
                          aria-label={isExpanded ? 'Recolher' : 'Expandir'}
                        >
                          <svg
                            className={`w-3.5 h-3.5 transition-transform ${isExpanded ? '' : '-rotate-90'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>

                      {/* Cidades */}
                      {isExpanded && (
                        <div className="ml-5 space-y-0.5">
                          {visibleCities.map((city) => {
                            const status = getCityStatus(city, itemMap);
                            const item = itemMap.get(city);
                            const selectable = isSelectable(status);
                            const isSelected = selectedCities.has(city);

                            // Pending or processing → non-interactive
                            if (status === 'pending' || status === 'processing') {
                              return (
                                <div key={city} className="flex items-center gap-1.5">
                                  <StatusBadge status={status} />
                                  <span className="text-xs text-gray-400">{city}</span>
                                </div>
                              );
                            }

                            // Selectable: free, failed, done
                            return (
                              <label
                                key={city}
                                title={status === 'failed' && item?.error ? item.error : undefined}
                                className={`flex items-center gap-1.5 ${selectable ? 'cursor-pointer' : 'cursor-default'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleCity(city, status)}
                                  className="w-3 h-3 accent-gray-900"
                                />
                                <span
                                  className={`text-xs ${status === 'failed'
                                      ? 'text-red-500 font-medium'
                                      : status === 'done'
                                        ? isSelected
                                          ? 'text-emerald-700 font-medium'
                                          : 'text-emerald-600'
                                        : isSelected
                                          ? 'text-gray-900 font-medium'
                                          : 'text-gray-600'
                                    }`}
                                >
                                  {city}
                                  {status === 'failed' && (
                                    <span className="ml-1 text-red-400 font-normal">✗</span>
                                  )}
                                  {status === 'done' && item?.content_id && !isSelected && (
                                    <Link
                                      href={`/contents/${item.content_id}`}
                                      onClick={(e) => e.stopPropagation()}
                                      className="ml-1 text-emerald-500 hover:underline font-normal"
                                    >
                                      ✓
                                    </Link>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modo de geração */}
              <div className="mt-3 pt-3 bib-divider">
                <p className="text-xs text-gray-500 mb-1.5">Modo de geração</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMode('ai')}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${mode === 'ai'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                  >
                    Gerar com IA
                  </button>
                  <button
                    onClick={() => setMode('template')}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-medium transition-colors ${mode === 'template'
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                  >
                    Com Template
                  </button>
                </div>
              </div>

              {/* Botão enfileirar */}
              <div className="mt-2">
                <button
                  onClick={handleEnqueue}
                  disabled={selectedCities.size === 0 || enqueueing}
                  className="bib-btn bib-btn-primary w-full py-2"
                >
                  {enqueueing
                    ? 'A enfileirar...'
                    : selectedCities.size > 0
                      ? `Enfileirar ${selectedCities.size} cidade${selectedCities.size !== 1 ? 's' : ''}`
                      : 'Seleciona cidades'}
                </button>
              </div>
            </div>
          </div>

          {/* Painel direito: fila */}
          <div className="flex-1 min-w-0">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-4 gap-3 mb-5">
                {(
                  [
                    { label: 'Pendentes', value: stats.pending, color: 'text-gray-600' },
                    { label: 'A processar', value: stats.processing, color: 'text-amber-600' },
                    { label: 'Concluídos', value: stats.done, color: 'text-emerald-600' },
                    { label: 'Falhados', value: stats.failed, color: 'text-red-500' },
                  ] as const
                ).map(({ label, value, color }) => (
                  <div
                    key={label}
                    className="bg-white border border-gray-200 rounded-xl px-4 py-3 text-center"
                  >
                    <p className={`text-xl font-bold ${color}`}>{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Lista de itens */}
            <div className="bib-card" style={{ padding: 0, overflow: 'hidden' }}>
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="bib-title" style={{ fontSize: '0.875rem' }}>
                  Fila ({queueItems.length} itens)
                </h3>
              </div>

              {queueItems.length === 0 ? (
                <div className="bib-empty" style={{ padding: '2.5rem 1rem' }}>
                  Nenhum item na fila. Seleciona cidades e clica em &quot;Enfileirar&quot;.
                </div>
              ) : (
                <div className="divide-y divide-gray-100 max-h-[calc(100vh-320px)] overflow-y-auto">
                  {queueItems.map((item) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <StatusBadge status={item.status as CityStatus} />
                        <div className="min-w-0">
                          {item.status === 'done' && item.content_id ? (
                            <Link
                              href={`/contents/${item.content_id}`}
                              className="text-sm text-gray-900 hover:text-gray-600 hover:underline truncate block"
                            >
                              {service?.name} em {item.city}
                            </Link>
                          ) : (
                            <p className="text-sm text-gray-900 truncate">
                              {service?.name} em {item.city}
                            </p>
                          )}
                          {item.error && (
                            <p className="text-xs text-red-500 truncate mt-0.5" title={item.error}>
                              {item.error}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        {item.mode === 'template' && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">
                            template
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.status === 'done'
                              ? 'bg-emerald-50 text-emerald-700'
                              : item.status === 'processing'
                                ? 'bg-amber-50 text-amber-700'
                                : item.status === 'failed'
                                  ? 'bg-red-50 text-red-600'
                                  : 'bg-gray-100 text-gray-500'
                            }`}
                        >
                          {item.status}
                        </span>
                        {item.status === 'failed' && (
                          <button
                            onClick={() => {
                              void api.retryQueueItem(item.id).then(() => poll());
                            }}
                            className="text-xs text-gray-500 hover:text-gray-900 underline"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
