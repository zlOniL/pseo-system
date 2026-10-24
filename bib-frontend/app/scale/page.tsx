'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { publishContentWithRemoteConfirm } from '@/lib/publish';
import {
  Content,
  ContentSummary,
  GenerateTemplateInput,
  QueueFilters,
  QueueItem,
  QueueStats,
  RegionWithCities,
  Service,
  ServiceTemplate,
  RelatedService,
} from '@/lib/types';

import { HybridPanel } from './HybridPanel';

type QueueMode = 'ai' | 'template' | 'library' | 'hybrid';
type PageKind = 'main' | 'locality';
type QueueStatus = QueueItem['status'];
type ReviewStatus = ContentSummary['status'];
type WorkView = 'production' | 'review' | 'queue';
type PeriodPreset = '24h' | 'today' | 'yesterday' | '7d' | '30d' | 'custom' | 'all';
type LocalitySelection = {
  label: string;
  cities?: string[];
} | null;
type ExistingPageConflict = Pick<ContentSummary, 'id' | 'city' | 'status'>;
type ExistingPageDialog =
  | { kind: 'main' }
  | { kind: 'locality'; conflicts: ExistingPageConflict[] };

const PAGE_LIMIT_OPTIONS = [50, 100, 250, 500, 1000] as const;
const DEFAULT_PAGE_LIMIT = 50;
const PRODUCTION_LIST_STATUSES: QueueStatus[] = ['pending', 'done', 'failed'];
const REVIEW_STATUSES: ReviewStatus[] = ['draft', 'approved', 'published'];
const ALL_MODES: QueueMode[] = ['ai', 'template', 'library', 'hybrid'];
const SITE_STORAGE_KEY = 'bib-selected-site-id';

const MAIN_LOCALITIES = [
  'Lisboa',
  'Cascais',
  'Oeiras',
  'Loures',
  'Sintra',
  'Amadora',
  'Odivelas',
  'Vila Franca de Xira',
  'Margem Sul',
  'Setubal',
  'Montijo',
  'Alcochete',
  'Barreiro',
  'Seixal',
  'Almada',
  'Quinta do Conde',
  'Palmela',
  'Pinhal Novo',
  'Porto',
  'Vila Nova de Gaia',
  'Maia',
  'Matosinhos',
  'Valongo',
  'Gondomar',
  'Espinho',
  'Braga',
  'Guimaraes',
  'Barcelos',
  'Algarve',
  'Lagos',
  'Portimao',
  'Loule',
  'Quarteira',
  'Albufeira',
  'Vilamoura',
  'Faro',
  'Olhao',
  'Almancil',
];

function todayStartIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function yesterdayStartIso() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function yesterdayEndIso() {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function lastHoursIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function dateInputToIso(value: string, endOfDay = false) {
  if (!value) return undefined;
  const date = new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`);
  return date.toISOString();
}

function dateToInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function periodToDateInputs(period: PeriodPreset) {
  const today = new Date();

  if (period === 'all' || period === 'custom') {
    return { fromDate: '', toDate: '' };
  }

  if (period === 'today') {
    const value = dateToInputValue(today);
    return { fromDate: value, toDate: value };
  }

  if (period === 'yesterday') {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const value = dateToInputValue(yesterday);
    return { fromDate: value, toDate: value };
  }

  const from = new Date(today);
  if (period === '24h') from.setDate(from.getDate() - 1);
  if (period === '7d') from.setDate(from.getDate() - 7);
  if (period === '30d') from.setDate(from.getDate() - 30);

  return {
    fromDate: dateToInputValue(from),
    toDate: dateToInputValue(today),
  };
}

function formatDate(value: string | null) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDuration(item: QueueItem) {
  const start = item.started_at ? new Date(item.started_at).getTime() : null;
  const end = item.finished_at ? new Date(item.finished_at).getTime() : Date.now();
  if (!start) return '-';
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function isStuck(item: QueueItem) {
  if (item.status !== 'processing' || !item.started_at) return false;
  return Date.now() - new Date(item.started_at).getTime() > 30 * 60 * 1000;
}

function statusLabel(status: QueueItem['status']) {
  return {
    pending: 'Pendente',
    processing: 'Processando',
    done: 'Concluido',
    failed: 'Falhado',
  }[status];
}

function compactStatusLabel(status: QueueItem['status']) {
  return {
    pending: 'fila',
    processing: 'gerando',
    done: 'gerada',
    failed: 'falhou',
  }[status];
}

function reviewStatusLabel(status: ReviewStatus) {
  return {
    draft: 'Rascunho',
    approved: 'Aprovada',
    published: 'Publicada',
  }[status];
}

function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  const classes =
    status === 'published'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : status === 'approved'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes}`}>
      {reviewStatusLabel(status)}
    </span>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-300">-</span>;
  const classes =
    score >= 75
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : score >= 50
        ? 'bg-amber-50 text-amber-700 border-amber-200'
        : 'bg-red-50 text-red-600 border-red-200';

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes}`}>
      {score}
    </span>
  );
}

function modeLabel(mode: QueueMode) {
  return {
    ai: 'IA',
    template: 'Template',
    library: 'Biblioteca',
    hybrid: 'Híbrido',
  }[mode];
}

function queueJobLabel(item: QueueItem) {
  return item.job_type === 'template' ? 'Criação de template' : modeLabel(item.mode);
}

function StatusBadge({ item }: { item: QueueItem }) {
  const stuck = isStuck(item);
  const classes = stuck
    ? 'bg-orange-50 text-orange-700 border-orange-200'
    : item.status === 'done'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
      : item.status === 'processing'
        ? 'bg-amber-50 text-amber-700 border-amber-100'
        : item.status === 'failed'
          ? 'bg-red-50 text-red-600 border-red-100'
          : 'bg-gray-100 text-gray-600 border-gray-200';

  return (
    <span className={`inline-flex rounded-md border px-2 py-1 text-xs font-medium ${classes}`}>
      {stuck ? 'Travado?' : statusLabel(item.status)}
    </span>
  );
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function filterStats(stats: QueueStats | null) {
  if (!stats) return { total: 0, successRate: 0 };
  const total = stats.pending + stats.processing + stats.done + stats.failed;
  const completed = stats.done + stats.failed;
  return {
    total,
    successRate: completed > 0 ? Math.round((stats.done / completed) * 100) : 0,
  };
}

function normalizeQueueResult(
  result: Awaited<ReturnType<typeof api.listQueue>> | QueueItem[],
) {
  const data = Array.isArray(result) ? result : (result.data ?? []);
  const total = Array.isArray(result) ? data.length : result.total;
  return { data, total };
}

function buildQueueFilters(input: {
  selectedSiteId: string;
  serviceId: string;
  selectedStatuses: QueueStatus[];
  selectedModes: QueueMode[];
  period: PeriodPreset;
  fromDate: string;
  toDate: string;
  selectedLocality: LocalitySelection;
  cityQuery: string;
}): QueueFilters {
  const next: QueueFilters = {};

  if (input.period === '24h') next.from = lastHoursIso(24);
  if (input.period === 'today') next.from = todayStartIso();
  if (input.period === 'yesterday') {
    next.from = yesterdayStartIso();
    next.to = yesterdayEndIso();
  }
  if (input.period === '7d') next.from = daysAgoIso(7);
  if (input.period === '30d') next.from = daysAgoIso(30);
  if (input.period === 'custom') {
    next.from = dateInputToIso(input.fromDate);
    next.to = dateInputToIso(input.toDate, true);
  }

  if (input.selectedSiteId) next.site_id = input.selectedSiteId;
  if (input.serviceId) next.service_id = input.serviceId;
  if (
    input.selectedStatuses.length > 0 &&
    input.selectedStatuses.length < PRODUCTION_LIST_STATUSES.length
  ) {
    next.status = input.selectedStatuses.join(',');
  }
  next.mode = input.selectedModes.join(',');
  if (input.selectedLocality?.cities?.length) {
    next.cities = input.selectedLocality.cities;
  } else if (input.cityQuery.trim()) {
    next.city = input.cityQuery.trim();
  }

  return next;
}

function contentFiltersFromQueueFilters(filters: QueueFilters, status?: string) {
  return {
    status,
    site_id: filters.site_id,
    service_id: filters.service_id,
    city: filters.city,
    cities: filters.cities,
    from: filters.from,
    to: filters.to,
  };
}

function ToggleCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs text-gray-700 hover:border-gray-400">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="h-3.5 w-3.5 accent-gray-900"
      />
      <span>{label}</span>
    </label>
  );
}

function toggleSetValue<T extends string>(values: T[], value: T, allValues: T[]) {
  const next = values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
  return next.length === 0 ? allValues : next;
}

function toggleFilterValue<T extends string>(values: T[], value: T) {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
}

function statusFilterParam<T extends string>(values: T[], allValues: readonly T[]) {
  if (values.length === 0 || values.length === allValues.length) return undefined;
  return values.join(',');
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values));
}

function validRelatedServices(services: RelatedService[] | null | undefined) {
  return (services ?? []).filter((item) => item.name.trim() && item.url.trim());
}
function mainCityForRegion(region: RegionWithCities) {
  return region.cities.find((city) => normalize(city) === normalize(region.region)) ?? region.region;
}

function localityCitiesForRegion(region: RegionWithCities) {
  const mainCity = mainCityForRegion(region);
  return region.cities.filter((city) => normalize(city) !== normalize(mainCity));
}

function NewGenerationModal({
  open,
  initialServiceId,
  initialPageKind,
  siteId,
  services,
  regions,
  onClose,
  onCreated,
  onMainCreated,
}: {
  open: boolean;
  initialServiceId: string;
  initialPageKind: PageKind;
  siteId: string;
  services: Service[];
  regions: RegionWithCities[];
  onClose: () => void;
  onCreated: (serviceId: string, count: number, pageKind: PageKind) => void;
  onMainCreated: (serviceId: string) => void;
}) {
  const [serviceId, setServiceId] = useState(initialServiceId);
  const [pageKind, setPageKind] = useState<PageKind>(initialPageKind);
  const [mode, setMode] = useState<QueueMode>('ai');
  const [hybridReady, setHybridReady] = useState(false);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [previousItems, setPreviousItems] = useState<QueueItem[]>([]);
  const [previousContents, setPreviousContents] = useState<ContentSummary[]>([]);
  const [historyReady, setHistoryReady] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [mainContent, setMainContent] = useState<Content | null>(null);
  const [citySearch, setCitySearch] = useState('');
  const [expandedRegions, setExpandedRegions] = useState<Set<string>>(new Set());
  const [selectedCities, setSelectedCities] = useState<Set<string>>(new Set());
  const [enqueueing, setEnqueueing] = useState(false);
  const [creatingMainPage, setCreatingMainPage] = useState(false);
  const [mainPageNotes, setMainPageNotes] = useState('');
  const [existingPageDialog, setExistingPageDialog] = useState<ExistingPageDialog | null>(null);

  const selectedService = services.find((service) => service.id === serviceId) ?? null;
  const mainStatus = mainContent?.status ?? null;
  const canCreateLocalities = mainStatus === 'published';
  const localitiesDisabled = pageKind === 'main' || !canCreateLocalities;
  const mainPageTemplate = templates.find((template) => template.is_main_page) ?? null;
  const regularTemplates = templates.filter((template) => !template.is_main_page);
  const missingMainPage = pageKind === 'locality' && Boolean(selectedService && !mainContent && !mainPageTemplate);

  useEffect(() => {
    if (!open) return;
    setServiceId(initialServiceId);
    setPageKind(initialPageKind);
    setMode('ai');
    setSelectedCities(new Set());
    setCitySearch('');
    setExpandedRegions(new Set());
    const initialService = services.find((service) => service.id === initialServiceId) ?? null;
    setMainPageNotes(initialService?.service_notes ?? '');
  }, [initialPageKind, initialServiceId, open, services]);

  useEffect(() => {
    if (pageKind === 'main') setMode('ai');
  }, [pageKind]);

  useEffect(() => {
    if (!open || !selectedService) return;
    setMainPageNotes(selectedService.service_notes ?? '');
  }, [open, selectedService]);

  useEffect(() => {
    if (!open || !serviceId) {
      setTemplates([]);
      setTemplateId('');
      setPreviousItems([]);
      setPreviousContents([]);
      setHistoryReady(false);
      setHistoryError(false);
      setMainContent(null);
      return;
    }

    api
      .listTemplates(serviceId)
      .then((items) => {
        setTemplates(items);
        setTemplateId(items.find((item) => !item.is_main_page)?.id ?? '');
      })
      .catch(() => {
        setTemplates([]);
        setTemplateId('');
      });

    setHistoryReady(false);
    setHistoryError(false);
    Promise.allSettled([
      api.listQueue({ service_id: serviceId, site_id: siteId || undefined, limit: 1000 }),
      api.listContents({ service_id: serviceId, site_id: siteId || undefined, limit: 1000 }),
    ]).then(([queueResult, contentResult]) => {
      const failed = queueResult.status === 'rejected' || contentResult.status === 'rejected';
      setHistoryError(failed);
      setPreviousItems(
        queueResult.status === 'fulfilled' ? normalizeQueueResult(queueResult.value).data : [],
      );
      setPreviousContents(
        contentResult.status === 'fulfilled' ? contentResult.value.data : [],
      );
      setHistoryReady(true);
    });

    api
      .getMainTemplateContent(serviceId)
      .then(setMainContent)
      .catch(() => setMainContent(null));
  }, [open, serviceId, siteId]);

  const itemByCity = useMemo(
    () => new Map(
      previousItems
        .filter((item): item is QueueItem & { city: string } => Boolean(item.city))
        .map((item) => [normalize(item.city.trim()), item]),
    ),
    [previousItems],
  );

  const contentCityKeys = useMemo(
    () => new Set(previousContents.map((content) => normalize(content.city.trim()))),
    [previousContents],
  );

  const visibleRegions = useMemo(() => {
    const search = normalize(citySearch.trim());
    if (!search) return regions;
    return regions
      .map((region) => ({
        ...region,
        cities: region.cities.filter((city) => normalize(city).includes(search)),
      }))
      .filter(
        (region) =>
          normalize(region.region).includes(search) || region.cities.length > 0,
      );
  }, [citySearch, regions]);

  function toggleCity(city: string) {
    if (localitiesDisabled) return;
    setSelectedCities((current) => {
      const next = new Set(current);
      if (next.has(city)) next.delete(city);
      else next.add(city);
      return next;
    });
  }

  function selectCities(cities: string[]) {
    if (localitiesDisabled) return;
    setSelectedCities(new Set(uniqueValues(cities)));
    setExpandedRegions(
      new Set(
        regions
          .filter((region) => region.cities.some((city) => cities.includes(city)))
          .map((region) => region.region),
      ),
    );
  }

  function selectMainLocalities() {
    const allCities = regions.flatMap((region) => region.cities);
    const normalizedMain = new Set(MAIN_LOCALITIES.map(normalize));
    selectCities(allCities.filter((city) => normalizedMain.has(normalize(city))));
  }

  function selectFailed() {
    selectCities(
      previousItems
        .filter((item): item is QueueItem & { city: string } => item.status === 'failed' && Boolean(item.city))
        .map((item) => item.city),
    );
  }

  function selectNotGenerated() {
    selectCities(
      regions
        .flatMap((region) => region.cities)
        .filter((city) => {
          const cityKey = normalize(city.trim());
          return !itemByCity.has(cityKey) && !contentCityKeys.has(cityKey);
        }),
    );
  }

  function toggleRegionLocalities(region: RegionWithCities) {
    if (localitiesDisabled) return;
    const localities = localityCitiesForRegion(region);
    if (localities.length === 0) return;

    setSelectedCities((current) => {
      const next = new Set(current);
      const allSelected = localities.every((city) => next.has(city));
      localities.forEach((city) => {
        if (allSelected) next.delete(city);
        else next.add(city);
      });
      return next;
    });

    setExpandedRegions((current) => new Set(current).add(region.region));
  }

  function toggleRegionAll(region: RegionWithCities) {
    if (localitiesDisabled) return;
    setSelectedCities((current) => {
      const next = new Set(current);
      const allSelected = region.cities.every((city) => next.has(city));
      region.cities.forEach((city) => {
        if (allSelected) next.delete(city);
        else next.add(city);
      });
      return next;
    });

    setExpandedRegions((current) => new Set(current).add(region.region));
  }

  async function handleCreateMainPage(recreate = false) {
    if (!selectedService || creatingMainPage) return;
    if (mainContent && !recreate) {
      setExistingPageDialog({ kind: 'main' });
      return;
    }

    setCreatingMainPage(true);
    try {
      const input: GenerateTemplateInput = {
        is_main_page: true,
        service_notes: mainPageNotes.trim() || undefined,
      };
      const related = validRelatedServices(selectedService.related_services);
      if (related.length > 0) input.related_services = related;

      const result = await api.createTemplate(selectedService.id, input);
      setTemplates((current) => [
        result.template,
        ...current.filter((template) => template.id !== result.template.id),
      ]);
      setMainContent(result.content);
      setSelectedCities(new Set());
      onMainCreated(selectedService.id);
      toast.success('Pagina principal criada. Publique para liberar localidades.', {
        action: result.content?.id
          ? {
              label: 'Revisar e publicar',
              onClick: () => { window.location.href = `/contents/${result.content.id}`; },
            }
          : undefined,
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao criar pagina principal.');
    } finally {
      setCreatingMainPage(false);
    }
  }

  async function enqueueCities(existing: 'skip' | 'recreate') {
    if (!serviceId) return;
    const cities = [...selectedCities];
    setEnqueueing(true);
    try {
      const created = await api.enqueue({
        service_id: serviceId,
        cities,
        mode,
        template_id: mode === 'template' ? templateId : undefined,
        existing,
      });
      onCreated(serviceId, created.length, 'locality');
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao adicionar a fila.');
    } finally {
      setEnqueueing(false);
    }
  }

  async function handleSubmit() {
    if (!serviceId) return;
    if (pageKind === 'main') {
      await handleCreateMainPage();
      return;
    }

    if (selectedCities.size === 0) return;
    if (!canCreateLocalities) {
      toast.error('Publique a pagina principal deste servico antes de gerar paginas de localidade.');
      return;
    }
    if (mode === 'hybrid' && !hybridReady) {
      toast.error('Prepare a biblioteca Híbrida antes de gerar.');
      return;
    }
    if (mode === 'template' && !templateId) {
      toast.error('Seleciona um template para continuar.');
      return;
    }

    if (
      mode === 'ai' &&
      selectedCities.size > 50 &&
      !window.confirm(
        `Serão geradas ${selectedCities.size} páginas com IA e adicionadas à fila. Deseja continuar?`,
      )
    ) {
      return;
    }

    try {
      const conflicts = await api.getQueueConflicts(serviceId, [...selectedCities]);
      if (conflicts.length > 0) {
        setExistingPageDialog({ kind: 'locality', conflicts });
        return;
      }
      await enqueueCities('skip');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao verificar paginas existentes.');
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/30 px-4">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {pageKind === 'main' || missingMainPage ? 'Criar pagina principal' : 'Nova geracao em escala'}
            </h2>
            <p className="text-xs text-gray-400">
              {pageKind === 'main' || missingMainPage
                ? 'Este servico precisa da pagina principal antes das localidades.'
                : 'Escolha o servico, modo e localidades.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          >
            Fechar
          </button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr] overflow-hidden">
          <aside className="space-y-4 overflow-y-auto border-r border-gray-100 p-5">
            <div>
              <label className="bib-label">Servico</label>
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className="bib-input"
              >
                <option value="">Selecionar servico</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="bib-label">Tipo de pagina</p>
              <div className="grid grid-cols-2 gap-1">
                {[
                  { value: 'main' as const, label: 'Principal' },
                  { value: 'locality' as const, label: 'Localidade' },
                ].map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setPageKind(item.value)}
                    className={`rounded-md border px-2 py-2 text-xs font-medium ${
                      pageKind === item.value
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 rounded-lg border border-gray-200 px-3 py-2">
                <p className="text-xs text-gray-400">Pagina principal</p>
                <p className="text-sm font-medium text-gray-800">
                  {mainStatus ? reviewStatusLabel(mainStatus) : mainPageTemplate ? 'Template criado' : 'Nao criada'}
                </p>
              </div>
              {pageKind === 'locality' && !canCreateLocalities && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Publique a pagina principal para liberar localidades.
                </p>
              )}
            </div>

            <div>
              <p className="bib-label">Modo</p>
              <div className="grid grid-cols-2 gap-1">
                {(['ai', 'template', 'library', 'hybrid'] as const).map((item) => (
                  <button
                    key={item}
                    disabled={pageKind === 'main' || !canCreateLocalities}
                    onClick={() => setMode(item)}
                    className={`rounded-md border px-2 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                      mode === item
                        ? 'border-gray-900 bg-gray-900 text-white'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-400'
                    }`}
                  >
                    {modeLabel(item)}
                  </button>
                ))}
              </div>
            </div>

            {mode === 'hybrid' && <HybridPanel key={serviceId} serviceId={serviceId} onReady={setHybridReady} />}

            {mode === 'template' && (
              <div>
                <label className="bib-label">Template</label>
                <select
                  value={templateId}
                  onChange={(event) => setTemplateId(event.target.value)}
                  className="bib-input"
                  disabled={regularTemplates.length === 0 || !canCreateLocalities}
                >
                  {regularTemplates.length === 0 ? (
                    <option value="">Nenhum template disponivel</option>
                  ) : (
                    regularTemplates.map((template) => (
                      <option key={template.id} value={template.id}>
                        #{template.version} - {template.label || template.base_city || 'Template'}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs font-medium text-gray-600">Resumo</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {pageKind === 'main' || missingMainPage ? 1 : selectedCities.size}
              </p>
              <p className="text-xs text-gray-400">
                {pageKind === 'main' || missingMainPage
                  ? `pagina principal para ${selectedService?.name ?? 'um servico'} usando IA`
                  : `paginas para ${selectedService?.name ?? 'um servico'} usando ${modeLabel(mode)}`}
              </p>
            </div>

            <div className="grid gap-2">
              <button disabled={localitiesDisabled} onClick={selectMainLocalities} className="bib-btn bib-btn-secondary justify-center text-xs disabled:opacity-40">
                Principais localidades
              </button>
              <button disabled={localitiesDisabled} onClick={selectFailed} className="bib-btn bib-btn-secondary justify-center text-xs disabled:opacity-40">
                Falhadas anteriormente
              </button>
              <button
                disabled={localitiesDisabled || !historyReady || historyError}
                onClick={selectNotGenerated}
                className="bib-btn bib-btn-secondary justify-center text-xs disabled:opacity-40"
                title={historyError ? 'Nao foi possivel carregar o historico de paginas.' : undefined}
              >
                Ainda nao geradas
              </button>
              <button
                disabled={localitiesDisabled}
                onClick={() => setSelectedCities(new Set())}
                className="bib-btn bib-btn-ghost justify-center text-xs disabled:opacity-40"
              >
                Limpar selecao
              </button>
            </div>
          </aside>

          <main className="flex min-h-0 flex-col p-5">
            {pageKind === 'main' || missingMainPage ? (
              <div className="flex min-h-0 flex-1 flex-col justify-between rounded-lg border border-amber-200 bg-amber-50 p-5">
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-amber-950">Pagina principal em falta</p>
                    <p className="mt-1 text-sm text-amber-800">
                      Para manter a estrutura SEO correta, crie primeiro a pagina principal de {selectedService?.name ?? 'este servico'}.
                      Depois de publicar essa pagina, a selecao de cidades e localidades fica disponivel neste modal.
                    </p>
                  </div>

                  <div>
                    <label className="bib-label">Contexto para a pagina principal</label>
                    <textarea
                      className="bib-textarea bg-white"
                      rows={5}
                      value={mainPageNotes}
                      onChange={(event) => setMainPageNotes(event.target.value)}
                      placeholder="Notas, tecnicas, marcas, diferenciais e informacoes uteis para a pagina principal..."
                    />
                    <p className="mt-1 text-xs text-amber-700">
                      As imagens, video e servicos complementares vem do cadastro do servico.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
                  A geracao por cidade, regeneracao de falhadas e selecao de localidades ficam bloqueadas ate esta pagina estar publicada.
                </div>
              </div>
            ) : (
              <>
                <input
                  value={citySearch}
                  onChange={(event) => setCitySearch(event.target.value)}
                  placeholder="Buscar cidade"
                  disabled={localitiesDisabled}
                  className="bib-input mb-4 disabled:opacity-40"
                />

                <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                  {visibleRegions.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
                      Nenhuma cidade encontrada.
                    </div>
                  )}
                  {visibleRegions.map((region) => {
                    const expanded = citySearch.trim()
                      ? true
                      : expandedRegions.has(region.region);
                    const mainCity = mainCityForRegion(region);
                    const localities = localityCitiesForRegion(region);
                    const visibleCitySet = new Set(region.cities);
                    const visibleLocalities = localities.filter((city) => visibleCitySet.has(city));
                    const selectedInRegion = region.cities.filter((city) => selectedCities.has(city)).length;
                    const selectedLocalities = localities.filter((city) => selectedCities.has(city)).length;
                    const previousMain = itemByCity.get(mainCity);
                    const mainSelected = selectedCities.has(mainCity);

                    return (
                      <div key={region.region} className="border-b border-gray-100 py-2">
                        <div className="flex items-center gap-2 py-1">
                          <button
                            onClick={() =>
                              setExpandedRegions((current) => {
                                const next = new Set(current);
                                if (next.has(region.region)) next.delete(region.region);
                                else next.add(region.region);
                                return next;
                              })
                            }
                            className="flex min-w-0 flex-1 items-center justify-between text-left"
                          >
                            <span className="truncate text-xs font-semibold uppercase tracking-wide text-gray-700">
                              {region.region}
                            </span>
                            <span className="ml-3 shrink-0 text-xs text-gray-400">
                              {selectedInRegion}/{region.cities.length}
                            </span>
                          </button>
                          <label
                            className={`flex shrink-0 items-center gap-2 rounded-md border px-2 py-1 text-xs ${
                              localitiesDisabled
                                ? 'cursor-not-allowed opacity-40'
                                : 'cursor-pointer'
                            } ${
                              mainSelected
                                ? 'border-gray-900 bg-gray-900 text-white'
                                : 'border-gray-200 text-gray-600 hover:border-gray-400'
                            }`}
                            title="Selecionar apenas a cidade principal"
                          >
                            <input
                              type="checkbox"
                              checked={mainSelected}
                              disabled={localitiesDisabled}
                              onChange={() => toggleCity(mainCity)}
                              className="h-3.5 w-3.5 accent-gray-900"
                            />
                            <span>Cidade</span>
                            {previousMain?.status === 'failed' && (
                              <span className="text-red-400">!</span>
                            )}
                            {previousMain && (
                              <span className="text-[10px] opacity-70">
                                {compactStatusLabel(previousMain.status)}
                              </span>
                            )}
                          </label>
                        </div>

                        {expanded && (
                          <div className="mt-2 space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                disabled={localitiesDisabled}
                                onClick={() => toggleRegionLocalities(region)}
                                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:border-gray-400 disabled:opacity-40"
                              >
                                {selectedLocalities === localities.length && localities.length > 0
                                  ? 'Desmarcar localidades'
                                  : 'Marcar localidades'}
                              </button>
                              <button
                                disabled={localitiesDisabled}
                                onClick={() => toggleRegionAll(region)}
                                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-600 hover:border-gray-400 disabled:opacity-40"
                              >
                                {selectedInRegion === region.cities.length
                                  ? 'Desmarcar tudo'
                                  : 'Marcar tudo'}
                              </button>
                            </div>

                            <div className="grid grid-cols-2 gap-1">
                              {visibleLocalities.map((city) => {
                                const previous = itemByCity.get(city);
                                const selected = selectedCities.has(city);
                                return (
                                  <label
                                    key={city}
                                    className={`flex items-center justify-between rounded-md border px-2 py-1.5 text-xs ${
                                      localitiesDisabled
                                        ? 'cursor-not-allowed opacity-40'
                                        : 'cursor-pointer'
                                    } ${
                                      selected
                                        ? 'border-gray-900 bg-gray-900 text-white'
                                        : 'border-gray-200 text-gray-600 hover:border-gray-400'
                                    }`}
                                  >
                                    <span className="truncate">{city}</span>
                                    {previous && (
                                      <span className="ml-auto shrink-0 text-[10px] opacity-70">
                                        {compactStatusLabel(previous.status)}
                                      </span>
                                    )}
                                    <input
                                      type="checkbox"
                                      checked={selected}
                                      disabled={localitiesDisabled}
                                      onChange={() => toggleCity(city)}
                                      className="ml-2"
                                    />
                                    {previous?.status === 'failed' && (
                                      <span className="ml-1 text-red-400">!</span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </main>
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
          <p className="text-xs text-gray-400">
            {pageKind === 'main' || missingMainPage
              ? 'A pagina principal nasce como rascunho e precisa ser publicada para liberar localidades.'
              : 'Retry volta para a fila normal; esta geracao tambem seguira a ordem da fila.'}
          </p>
          {pageKind === 'main' || missingMainPage ? (
            <button
              onClick={() => void handleCreateMainPage()}
              disabled={!serviceId || creatingMainPage}
              className="bib-btn bib-btn-primary"
            >
              {creatingMainPage ? 'Criando pagina principal...' : 'Criar pagina principal'}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!serviceId || selectedCities.size === 0 || enqueueing || !canCreateLocalities || (mode === 'hybrid' && !hybridReady)}
              className="bib-btn bib-btn-primary"
            >
              {enqueueing ? 'Adicionando...' : `Adicionar ${selectedCities.size || ''} a fila`}
            </button>
          )}
        </div>
      </div>

      {existingPageDialog && (
        <div className="fixed inset-0 flex items-center justify-center bg-gray-950/45 p-5">
          <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">
              {existingPageDialog.kind === 'main'
                ? 'A página principal já existe'
                : 'Há páginas já criadas na seleção'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {existingPageDialog.kind === 'main'
                ? 'Recriar gera uma nova versão para revisão; a página publicada atual permanece no ar até a nova publicação.'
                : `${existingPageDialog.conflicts.length} localidade${existingPageDialog.conflicts.length === 1 ? '' : 's'} já possui página no sistema.`}
            </p>
            {existingPageDialog.kind === 'locality' && (
              <p className="mt-3 max-h-24 overflow-y-auto rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
                {existingPageDialog.conflicts.map((item) => item.city).join(', ')}
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                onClick={() => setExistingPageDialog(null)}
                className="bib-btn bib-btn-ghost"
              >
                Cancelar
              </button>
              {existingPageDialog.kind === 'locality' && (
                <button
                  onClick={() => {
                    setExistingPageDialog(null);
                    void enqueueCities('skip');
                  }}
                  className="bib-btn bib-btn-secondary"
                >
                  Ignorar existentes
                </button>
              )}
              <button
                onClick={() => {
                  setExistingPageDialog(null);
                  if (existingPageDialog.kind === 'main') void handleCreateMainPage(true);
                  else void enqueueCities('recreate');
                }}
                className="bib-btn bib-btn-primary"
              >
                Recriar {existingPageDialog.kind === 'main' ? 'página' : 'seleção'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScalePageContent() {
  const searchParams = useSearchParams();
  const requestedServiceId = searchParams.get('service_id') ?? '';
  const requestedSiteId = searchParams.get('site_id') ?? '';
  const requestedCreateMain = searchParams.get('create') === 'main';
  const shouldOpenGenerateModal = searchParams.get('modal') === 'generate' || requestedCreateMain;
  const requestedView: WorkView =
    searchParams.get('view') === 'review'
      ? 'review'
      : searchParams.get('view') === 'queue'
        ? 'queue'
        : 'production';
  const rawReviewStatus = searchParams.get('review_status');
  const requestedReviewStatus = REVIEW_STATUSES.includes(rawReviewStatus as ReviewStatus)
    ? (rawReviewStatus as ReviewStatus)
    : null;
  const requestedCity = searchParams.get('city') ?? '';

  const [services, setServices] = useState<Service[]>([]);
  const [regions, setRegions] = useState<RegionWithCities[]>([]);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [contentItems, setContentItems] = useState<ContentSummary[]>([]);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [reviewStats, setReviewStats] = useState<Record<ReviewStatus, number>>({
    draft: 0,
    approved: 0,
    published: 0,
  });
  const [total, setTotal] = useState(0);
  const [selectedSiteId, setSelectedSiteId] = useState(requestedSiteId);
  const [serviceId, setServiceId] = useState(requestedServiceId);
  const [activeView, setActiveView] = useState<WorkView>(requestedView);
  const [selectedProductionStatuses, setSelectedProductionStatuses] = useState<QueueStatus[]>([]);
  const [selectedReviewStatuses, setSelectedReviewStatuses] = useState<ReviewStatus[]>(
    requestedReviewStatus ? [requestedReviewStatus] : [],
  );
  const [selectedModes, setSelectedModes] = useState<QueueMode[]>(ALL_MODES);
  const [period, setPeriod] = useState<PeriodPreset>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [cityQuery, setCityQuery] = useState(requestedCity);
  const [wholeCity, setWholeCity] = useState(false);
  const [selectedLocality, setSelectedLocality] = useState<LocalitySelection>(null);
  const [page, setPage] = useState(1);
  const [pageLimit, setPageLimit] = useState<number>(DEFAULT_PAGE_LIMIT);
  const [appliedFilters, setAppliedFilters] = useState<QueueFilters>(() =>
    buildQueueFilters({
      selectedSiteId: requestedSiteId,
      serviceId: requestedServiceId,
      selectedStatuses: [],
      selectedModes: ALL_MODES,
      period: 'all',
      fromDate: '',
      toDate: '',
      selectedLocality: null,
      cityQuery: requestedCity,
    }),
  );
  const [loading, setLoading] = useState(true);
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState('');
  const [actionErrors, setActionErrors] = useState<string[]>([]);
  const [modalOpen, setModalOpen] = useState(shouldOpenGenerateModal);
  const requestIdRef = useRef(0);
  const [listError, setListError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const urlIntentRef = useRef('');

  const localitySuggestions = useMemo(() => {
    const search = normalize(cityQuery.trim());
    if (!search) return [];

    if (wholeCity) {
      return regions
        .filter((region) => normalize(region.region).includes(search))
        .slice(0, 8)
        .map((region) => ({
          label: region.region,
          description: `${region.cities.length} localidades`,
          cities: region.cities,
        }));
    }

    const suggestions = regions.flatMap((region) =>
      region.cities.map((cityName) => ({
        label: cityName,
        description: region.region,
        cities: [cityName],
      })),
    );

    return suggestions
      .filter((item) => normalize(item.label).includes(search))
      .slice(0, 8);
  }, [cityQuery, regions, wholeCity]);

  const draftFilters = useMemo<QueueFilters>(() => buildQueueFilters({
    selectedSiteId,
    serviceId,
    selectedStatuses: selectedProductionStatuses,
    selectedModes,
    period,
    fromDate,
    toDate,
    selectedLocality,
    cityQuery,
  }), [
    cityQuery,
    fromDate,
    period,
    selectedProductionStatuses,
    selectedLocality,
    selectedModes,
    serviceId,
    selectedSiteId,
    toDate,
  ]);

  const loadPage = useCallback(
    async (showLoading = false) => {
      const requestId = ++requestIdRef.current;
      const current = () => requestId === requestIdRef.current;
      if (showLoading) {
        setLoading(true);
        setStatsLoading(true);
        setItems([]);
        setContentItems([]);
        setTotal(0);
      }
      const status = activeView === 'production'
        ? statusFilterParam(selectedProductionStatuses, PRODUCTION_LIST_STATUSES)
        : statusFilterParam(selectedReviewStatuses, REVIEW_STATUSES);
      const listRequest = activeView !== 'review'
        ? api.listQueue(activeView === 'queue' ? { queue_order: true, page, limit: pageLimit } : { ...appliedFilters, status, page, limit: pageLimit }).then((result) => {
            if (!current()) return;
            const normalized = normalizeQueueResult(result);
            setItems(normalized.data);
            setTotal(normalized.total);
          })
        : api.listContents({ ...contentFiltersFromQueueFilters(appliedFilters, status), page, limit: pageLimit }).then((result) => {
            if (!current()) return;
            setContentItems(result.data);
            setTotal(result.total);
          });
      const statsFilters = { ...appliedFilters };
      delete statsFilters.status;
      const statsRequest = activeView !== 'review'
        ? api.getQueueStats(activeView === 'queue' ? {} : statsFilters).then((result) => { if (current()) setStats(result); })
        : Promise.all(REVIEW_STATUSES.map(async (status) => {
            const result = await api.listContents({
              ...contentFiltersFromQueueFilters(appliedFilters, status), page: 1, limit: 10,
            });
            return [status, result.total] as const;
          })).then((pairs) => { if (current()) setReviewStats(Object.fromEntries(pairs) as Record<ReviewStatus, number>); });
      await Promise.allSettled([
        listRequest.then(() => { if (current()) setListError(null); }).catch((error: unknown) => {
          if (current()) setListError(error instanceof Error ? error.message : 'Falha ao carregar páginas.');
        }).finally(() => { if (current()) setLoading(false); }),
        statsRequest.then(() => { if (current()) setStatsError(null); }).catch(() => {
          if (current()) setStatsError('Não foi possível atualizar os contadores. A lista pode continuar a ser utilizada.');
        }).finally(() => { if (current()) setStatsLoading(false); }),
      ]);
    },
    [activeView, appliedFilters, page, pageLimit, selectedProductionStatuses, selectedReviewStatuses],
  );

  // All filters apply automatically; debounce text/date editing as a single search.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      setAppliedFilters(draftFilters);
    }, 300);
    return () => clearTimeout(timer);
  }, [draftFilters]);

  useEffect(() => {
    if (requestedSiteId) {
      setSelectedSiteId(requestedSiteId);
      setAppliedFilters((current) => ({ ...current, site_id: requestedSiteId }));
      return;
    }

    const stored = window.localStorage.getItem(SITE_STORAGE_KEY) ?? '';
    setSelectedSiteId(stored);
    setAppliedFilters((current) => {
      const next = { ...current };
      if (stored) next.site_id = stored;
      else delete next.site_id;
      return next;
    });
  }, [requestedSiteId]);

  useEffect(() => {
    const intent = `${requestedView}|${requestedReviewStatus}|${requestedServiceId}|${requestedSiteId}|${requestedCity}|${shouldOpenGenerateModal}`;
    if (urlIntentRef.current === intent) return;
    urlIntentRef.current = intent;

    setActiveView(requestedView);
    if (requestedView === 'review') setPeriod('all');
    setSelectedProductionStatuses([]);
    setSelectedReviewStatuses(requestedReviewStatus ? [requestedReviewStatus] : []);
    setPage(1);

    if (requestedServiceId) setServiceId(requestedServiceId);
    if (shouldOpenGenerateModal) setModalOpen(true);
    if (requestedCity || searchParams.has('city')) {
      setCityQuery(requestedCity);
      setSelectedLocality(null);
    }

    setAppliedFilters((current) => {
      const next = { ...current };
      delete next.status;
      if (requestedSiteId) next.site_id = requestedSiteId;
      if (requestedServiceId) next.service_id = requestedServiceId;
      if (requestedCity) {
        next.city = requestedCity;
        delete next.cities;
      } else if (searchParams.has('city')) {
        delete next.city;
        delete next.cities;
      }
      return next;
    });
  }, [
    requestedCity,
    requestedReviewStatus,
    requestedServiceId,
    requestedSiteId,
    requestedView,
    searchParams,
    shouldOpenGenerateModal,
  ]);

  useEffect(() => {
    function onSelected(event: Event) {
      const nextSiteId =
        (event as CustomEvent<{ siteId: string }>).detail?.siteId ?? '';
      setSelectedSiteId((currentSiteId) => {
        if (currentSiteId && currentSiteId !== nextSiteId) {
          setServiceId('');
        }
        setAppliedFilters((current) => {
          const next = { ...current };
          if (nextSiteId) next.site_id = nextSiteId;
          else delete next.site_id;
          if (currentSiteId && currentSiteId !== nextSiteId) delete next.service_id;
          return next;
        });
        return nextSiteId;
      });
      setPage(1);
    }

    window.addEventListener('bib-site-selected', onSelected);
    return () => window.removeEventListener('bib-site-selected', onSelected);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.listServices(selectedSiteId || undefined), api.getCities()])
      .then(([serviceItems, regionItems]) => {
        if (cancelled) return;
        setServices(serviceItems);
        setRegions(regionItems);

        if (
          serviceId &&
          serviceItems.length > 0 &&
          !serviceItems.some((service) => service.id === serviceId)
        ) {
          setServiceId('');
        }
      })
      .catch(() => { if (!cancelled) toast.error('Erro ao carregar serviços e localidades. Tente atualizar a página.'); });
    return () => { cancelled = true; };
  }, [selectedSiteId, serviceId]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async (initial: boolean) => {
      await loadPage(initial);
      if (!cancelled) timer = setTimeout(() => void poll(false), 10_000);
    };
    void poll(true);
    return () => { cancelled = true; clearTimeout(timer); ++requestIdRef.current; };
  }, [loadPage]);

  useEffect(() => {
    setSelectedPageIds(new Set());
  }, [
    activeView,
    appliedFilters,
    page,
    pageLimit,
    selectedProductionStatuses,
    selectedReviewStatuses,
  ]);

  const summary = filterStats(stats);
  const productionPendingCount = (stats?.pending ?? 0) + (stats?.processing ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / pageLimit));
  const selectedStatusCount =
    activeView === 'production'
      ? selectedProductionStatuses.length
      : selectedReviewStatuses.length;

  useEffect(() => {
    if (!loading && !listError && page > totalPages) setPage(totalPages);
  }, [page, totalPages, loading, listError]);

  const visibleRows = activeView === 'review' ? contentItems : items;
  const selectedRows = visibleRows.filter((item) => selectedPageIds.has(item.id));
  const selectedStatusesForActions = Array.from(new Set(selectedRows.map((item) => item.status)));
  const canBulkDelete = selectedRows.some((item) => item.status !== 'published');
  const canBulkRetry =
    activeView !== 'review' &&
    selectedRows.length > 0 &&
    selectedStatusesForActions.length === 1 &&
    selectedStatusesForActions[0] === 'failed';
  const canBulkApprove =
    activeView === 'review' &&
    selectedRows.length > 0 &&
    selectedStatusesForActions.length === 1 &&
    selectedStatusesForActions[0] === 'draft';
  const canBulkPublish =
    activeView === 'review' &&
    selectedRows.length > 0 &&
    selectedStatusesForActions.length === 1 &&
    selectedStatusesForActions[0] === 'approved';

  function toggleSelected(id: string) {
    setSelectedPageIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    if (visibleRows.length > 0 && selectedPageIds.size === visibleRows.length) {
      setSelectedPageIds(new Set());
      return;
    }
    setSelectedPageIds(new Set(visibleRows.map((item) => item.id)));
  }

  function applySearch() {
    const sameFilters =
      JSON.stringify(appliedFilters) === JSON.stringify(draftFilters);
    setPage(1);
    setAppliedFilters(draftFilters);
    if (sameFilters) void loadPage(true);
  }

  function handlePeriodChange(nextPeriod: PeriodPreset) {
    if (nextPeriod === 'custom' && period !== 'custom') {
      const range = periodToDateInputs(period);
      setFromDate(range.fromDate);
      setToDate(range.toDate);
    }

    setPeriod(nextPeriod);
  }

  function applyStatusFromCard(status: QueueStatus) {
    if (!PRODUCTION_LIST_STATUSES.includes(status)) return;
    setActiveView('production');
    setSelectedProductionStatuses((current) => toggleFilterValue(current, status));
    setPage(1);
  }

  async function retryItem(item: QueueItem) {
    try {
      await api.retryQueueItem(item.id);
      toast.success(`${item.city} voltou para a fila.`);
      setSelectedProductionStatuses(['pending']);
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao tentar novamente.');
    }
  }

  async function deleteQueueItem(item: QueueItem) {
    try {
      await api.deleteQueueItem(item.id);
      toast.success('Trabalho removido da fila. O conteúdo associado foi preservado.');
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir item.');
    }
  }

  async function handleBulkRetry() {
    const ids = selectedRows
      .filter((item): item is QueueItem => activeView !== 'review' && item.status === 'failed')
      .map((item) => item.id);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      await api.bulkRetryQueue(ids);
      setSelectedPageIds(new Set());
      setSelectedProductionStatuses(['pending']);
      toast.success(`${ids.length} item(ns) voltaram para a fila.`);
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao regenerar selecionadas.');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkApprove() {
    const ids = selectedRows
      .filter((item): item is ContentSummary => activeView === 'review' && item.status === 'draft')
      .map((item) => item.id);
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      await api.bulkApprove(ids);
      setSelectedPageIds(new Set());
      toast.success(`${ids.length} pagina(s) aprovada(s).`);
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao aprovar selecionadas.');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkPublish() {
    const selected = selectedRows.filter((item): item is ContentSummary => activeView === 'review' && item.status === 'approved');
    if (!selected.length) return;
    setBulkLoading(true);
    setActionErrors([]);
    const failures: string[] = [];
    const failedIds: string[] = [];
    let published = 0;
    try {
      for (let offset = 0; offset < selected.length; offset += 50) {
        const batch = selected.slice(offset, offset + 50);
        setBulkProgress(`A publicar ${offset + 1}–${offset + batch.length} de ${selected.length}…`);
        try {
          const results = await api.bulkPublish(batch.map((item) => item.id));
          for (const item of batch) {
            const result = results.find((result) => result.id === item.id);
            if (result?.success) published++;
            else {
              failedIds.push(item.id);
              failures.push(`${item.main_keyword}: ${result?.error || 'Sem confirmação do servidor.'}`);
            }
          }
        } catch (error) {
          for (const item of batch) {
            failedIds.push(item.id);
            failures.push(`${item.main_keyword}: ${error instanceof Error ? error.message : 'Falha de publicação.'}`);
          }
        }
      }
      setSelectedPageIds(new Set(failedIds));
      setActionErrors(failures);
      if (failures.length) toast.warning(`${published} publicada(s); ${failures.length} sem confirmação. Consulte os detalhes.`);
      else toast.success(`${published} página(s) publicada(s).`);
      void loadPage(false);
    } finally {
      setBulkLoading(false);
      setBulkProgress('');
    }
  }

  async function approveContentItem(content: ContentSummary) {
    try {
      await api.approveContent(content.id);
      toast.success(`${content.main_keyword} aprovada.`);
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao aprovar pagina.');
    }
  }

  async function publishContentItem(content: ContentSummary) {
    try {
      await publishContentWithRemoteConfirm(content.id);
      toast.success(`${content.main_keyword} publicada.`);
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao publicar pagina.');
    }
  }

  async function performBulkDelete(ids: string[]) {
    setBulkLoading(true);
    try {
      if (activeView !== 'review') {
        const result = await api.bulkDeleteQueue(ids);
        toast.success(`${result.deleted} item(ns) excluido(s).`);
      } else {
        const result = await api.bulkDelete(ids);
        if (result.skipped) toast.warning(`${result.deleted} página(s) excluída(s); ${result.skipped} ignorada(s), incluindo publicadas protegidas.`);
        else toast.success(`${result.deleted} página(s) excluída(s).`);
      }
      setSelectedPageIds(new Set());
      void loadPage(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao excluir selecionadas.');
    } finally {
      setBulkLoading(false);
    }
  }

  function handleBulkDelete() {
    const ids = selectedRows.map((item) => item.id);
    if (ids.length === 0) return;
    toast(`Excluir ${ids.length} item(ns) selecionado(s)?`, {
      action: { label: 'Confirmar', onClick: () => void performBulkDelete(ids) },
      cancel: { label: 'Cancelar', onClick: () => {} },
      duration: 10000,
    });
  }

  return (
    <div className="bib-page bg-gray-50">
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Lista de Paginas</h1>
            <p className="mt-1 text-sm text-gray-500">
              Acompanhe a produção e aceda a todas as páginas, incluindo aprovadas e publicadas.
            </p>
          </div>
          <button onClick={() => setModalOpen(true)} className="bib-btn bib-btn-primary">
            Gerar Páginas
          </button>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1">
            {[
              { view: 'production' as const, label: 'Produção' },
              { view: 'review' as const, label: 'Revisão' },
              { view: 'queue' as const, label: 'Fila' },
            ].map((item) => (
            <button
              key={item.view}
              onClick={() => {
                if (activeView !== item.view) {
                  setSelectedProductionStatuses([]);
                  setSelectedReviewStatuses([]);
                }
                if (item.view === 'review') { setPeriod('all'); setFromDate(''); setToDate(''); }
                setActiveView(item.view);
                setPage(1);
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeView === item.view
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              {item.label}
            </button>
            ))}
          </div>
          {activeView === 'review' && !statsLoading && !statsError && <span className="text-xs text-gray-500">{reviewStats.draft + reviewStats.approved + reviewStats.published} páginas · {reviewStats.draft} aguardam revisão</span>}
          {activeView !== 'queue' && selectedStatusCount > 0 && (
            <button
              onClick={() => {
                if (activeView === 'production') setSelectedProductionStatuses([]);
                else setSelectedReviewStatuses([]);
                setPage(1);
              }}
              className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-600 hover:border-gray-400 hover:text-gray-900"
            >
              Todos os Status
            </button>
          )}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {activeView !== 'review' ? (
            <>
              {[
                { label: 'Pendentes', value: productionPendingCount, color: 'text-gray-700', status: 'pending' as const },
                { label: 'Concluidas', value: stats?.done ?? 0, color: 'text-emerald-600', status: 'done' as const },
                { label: 'Falhadas', value: stats?.failed ?? 0, color: 'text-red-600', status: 'failed' as const },
              ].map((card) => (
                <button
                  key={card.label}
                  onClick={() => { if (activeView !== 'queue') applyStatusFromCard(card.status); }}
                  disabled={activeView === 'queue'}
                  className={`rounded-lg border bg-white px-4 py-3 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 ${
                    selectedProductionStatuses.includes(card.status)
                      ? 'border-gray-900'
                      : 'border-gray-200'
                  }`}
                >
                  <p className={`text-2xl font-semibold ${card.color}`}>{statsLoading || statsError ? '—' : card.value}</p>
                  <p className="mt-1 text-xs text-gray-400">{card.label}</p>
                </button>
              ))}
              <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
                <p className="text-2xl font-semibold text-gray-900">{statsLoading || statsError ? '—' : `${summary.successRate}%`}</p>
                <p className="mt-1 text-xs text-gray-400">Trabalhos concluídos com sucesso</p>
              </div>
            </>
          ) : (
            REVIEW_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() => {
                  setSelectedReviewStatuses((current) => toggleFilterValue(current, status));
                  setPage(1);
                }}
                className={`rounded-lg border bg-white px-4 py-3 text-left transition-colors hover:border-gray-400 hover:bg-gray-50 ${
                  selectedReviewStatuses.includes(status) ? 'border-gray-900' : 'border-gray-200'
                }`}
              >
                <p
                  className={`text-2xl font-semibold ${
                    status === 'published'
                      ? 'text-emerald-600'
                      : status === 'approved'
                        ? 'text-amber-600'
                        : 'text-gray-700'
                  }`}
                >
                  {statsLoading || statsError ? '—' : reviewStats[status]}
                </p>
                <p className="mt-1 text-xs text-gray-400">{status === 'draft' ? 'Rascunhos — aguardam revisão' : `${reviewStatusLabel(status)}s`}</p>
              </button>
            ))
          )}
        </div>

        {activeView === 'queue' && (
          <p className="mb-2 text-xs text-gray-500">
            A Fila é global: ignora o site selecionado e mostra primeiro os itens em processamento e pendentes.
          </p>
        )}
        <div className={`mb-4 rounded-lg border border-gray-200 bg-white ${activeView === 'queue' ? 'hidden' : ''}`}>
          <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(220px,1fr)_minmax(250px,1.2fr)]">
            <div>
              <label className="bib-label">Servico</label>
              <select
                value={serviceId}
                onChange={(event) => setServiceId(event.target.value)}
                className="bib-input"
              >
                <option value="">Todos os servicos</option>
                {services.map((service) => (
                  <option key={service.id} value={service.id}>
                    {service.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <div className="mb-1.5 flex items-center justify-between gap-3">
                <label className="bib-label mb-0">Localidade</label>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={wholeCity}
                    onChange={(event) => {
                      setWholeCity(event.target.checked);
                      setSelectedLocality(null);
                    }}
                    className="h-3.5 w-3.5 accent-gray-900"
                  />
                  Cidade inteira
                </label>
              </div>
              <input
                value={cityQuery}
                onChange={(event) => {
                  setCityQuery(event.target.value);
                  setSelectedLocality(null);
                }}
                placeholder={wholeCity ? 'Buscar cidade principal' : 'Buscar localidade'}
                className="bib-input"
              />
              {selectedLocality && (
                <button
                  onClick={() => {
                    setSelectedLocality(null);
                    setCityQuery('');
                  }}
                  className="mt-1 text-xs text-gray-400 hover:text-gray-700"
                >
                  Limpar filtro de {selectedLocality.label}
                </button>
              )}
              {localitySuggestions.length > 0 && !selectedLocality && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
                  {localitySuggestions.map((suggestion) => (
                    <button
                      key={`${suggestion.label}-${suggestion.description}`}
                      onClick={() => {
                        setSelectedLocality({
                          label: suggestion.label,
                          cities: suggestion.cities,
                        });
                        setCityQuery(suggestion.label);
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                    >
                      <span className="font-medium text-gray-800">{suggestion.label}</span>
                      <span className="text-xs text-gray-400">{suggestion.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-4 border-t border-gray-100 px-4 py-4 lg:grid-cols-2">
            {activeView === 'production' && <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="bib-label mb-0">Modos</p>
                <button
                  onClick={() => setSelectedModes(ALL_MODES)}
                  className="text-xs text-gray-400 hover:text-gray-700"
                >
                  Todos
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ALL_MODES.map((item) => (
                  <ToggleCheckbox
                    key={item}
                    checked={selectedModes.includes(item)}
                    label={modeLabel(item)}
                    onChange={() =>
                      setSelectedModes((current) =>
                        toggleSetValue(current, item, ALL_MODES),
                      )
                    }
                  />
                ))}
              </div>
            </div>}

            <div>
              <label className="bib-label">Período de criação</label>
              <select
                value={period}
                onChange={(event) => handlePeriodChange(event.target.value as PeriodPreset)}
                className="bib-input"
              >
                <option value="24h">Ultimas 24 horas</option>
                <option value="today">Hoje</option>
                <option value="yesterday">Ontem</option>
                <option value="7d">Ultimos 7 dias</option>
                <option value="30d">Ultimos 30 dias</option>
                <option value="custom">Periodo especifico</option>
                <option value="all">Todo o período</option>
              </select>
              {period === 'custom' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    className="bib-input"
                  />
                  <input
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    className="bib-input"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <p className="text-xs text-gray-400">
              {JSON.stringify(appliedFilters) !== JSON.stringify(draftFilters) ? 'A aplicar filtros…' : 'Filtros aplicados automaticamente. O período refere-se à criação de cada registo.'}
            </p>
            <button onClick={applySearch} className="bib-btn bib-btn-primary">
              Atualizar
            </button>
          </div>
        </div>

        {actionErrors.length > 0 && <div role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <p className="font-medium">Páginas sem confirmação de publicação</p>
          <ul className="mt-2 max-h-48 overflow-auto">{actionErrors.map((error, index) => <li key={index}>{error}</li>)}</ul>
          <button onClick={() => setActionErrors([])} className="mt-2 underline">Fechar detalhes</button>
        </div>}
        {statsError && <p role="status" className="mb-3 text-sm text-amber-700">{statsError}</p>}
        {listError && <div role="alert" className="mb-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Não foi possível atualizar a lista. {listError} Os dados anteriores, se visíveis, podem estar desatualizados.
          <button onClick={() => void loadPage(true)} className="ml-3 underline">Tentar novamente</button>
        </div>}
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {activeView === 'queue' ? 'Fila global' : 'Lista de Paginas'}
              </h2>
              <p className="text-xs text-gray-400">
                {loading
                  ? 'Carregando...'
                  : activeView === 'queue'
                    ? `${total} item(ns), com itens ativos no topo e sem filtro de site`
                    : `${total} item(ns) encontrados nos filtros atuais`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selectedPageIds.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-white">
                  <span className="text-xs font-medium">
                    {selectedPageIds.size} selecionado{selectedPageIds.size !== 1 ? 's' : ''}
                  </span>
                  {bulkLoading ? (
                    <span className="text-xs text-gray-300">{bulkProgress || 'A processar…'}</span>
                  ) : (
                    <>
                      {canBulkApprove && (
                        <button onClick={handleBulkApprove} className="rounded-md border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800">
                          Aprovar
                        </button>
                      )}
                      {canBulkPublish && (
                        <button onClick={handleBulkPublish} className="rounded-md border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800">
                          Publicar
                        </button>
                      )}
                      {canBulkRetry && (
                        <button onClick={handleBulkRetry} className="rounded-md border border-gray-600 px-2 py-1 text-xs hover:bg-gray-800">
                          Regenerar
                        </button>
                      )}
                      {canBulkDelete && (
                        <button onClick={handleBulkDelete} className="rounded-md border border-red-500 px-2 py-1 text-xs text-red-200 hover:bg-red-950/40">
                          Excluir
                        </button>
                      )}
                      <button onClick={() => setSelectedPageIds(new Set())} className="px-1 text-xs text-gray-300 hover:text-white">
                        Cancelar
                      </button>
                    </>
                  )}
                </div>
              )}
              <button onClick={() => void loadPage(true)} className="bib-btn bib-btn-secondary text-xs">
                Atualizar
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-400">
                {activeView !== 'review' ? (
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={visibleRows.length > 0 && selectedPageIds.size === visibleRows.length}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 accent-gray-900"
                      />
                    </th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Servico</th>
                    <th className="px-4 py-3">Cidade</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3">Tent.</th>
                    <th className="px-4 py-3">Criado</th>
                    <th className="px-4 py-3">Duracao</th>
                    <th className="px-4 py-3">Erro</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={visibleRows.length > 0 && selectedPageIds.size === visibleRows.length}
                        onChange={toggleAllVisible}
                        className="h-4 w-4 accent-gray-900"
                      />
                    </th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Pagina</th>
                    <th className="px-4 py-3">Cidade</th>
                    <th className="px-4 py-3">Score</th>
                    <th className="px-4 py-3">Criado</th>
                    <th className="px-4 py-3 text-right">Acoes</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeView !== 'review' ? 10 : 7} className="px-4 py-12 text-center text-sm text-gray-400">
                      {loading ? 'A carregar páginas…' : listError ? 'Lista indisponível. Tente novamente.' : <>
                        Nenhum item encontrado para estes filtros.
                        {activeView !== 'queue' && period !== 'all' && <button className="ml-2 underline" onClick={() => setPeriod('all')}>Pesquisar em todo o período</button>}
                      </>}
                    </td>
                  </tr>
                ) : activeView !== 'review' ? (
                  items.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPageIds.has(item.id)}
                          onChange={() => toggleSelected(item.id)}
                          className="h-4 w-4 accent-gray-900"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge item={item} />
                        {item.content && <div className="mt-1"><ReviewStatusBadge status={item.content.status} /></div>}
                        {item.status === 'done' && !item.content && <p className="mt-1 text-xs text-amber-700">Conteúdo indisponível</p>}
                        {item.status === 'done' && item.content?.status === 'published' &&
                          <p className="mt-1 text-xs text-gray-500">Página publicada disponível</p>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="min-w-[180px]">
                          <p className="font-medium text-gray-900">{item.service?.name ?? 'Servico removido'}</p>
                          {item.service_id && (
                            <Link href={`/services/${item.service_id}`} className="text-xs text-gray-400 hover:text-gray-700">
                              Abrir servico
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{item.city ?? 'Página principal'}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">{queueJobLabel(item)}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{item.attempts}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDuration(item)}</td>
                      <td className="max-w-xs px-4 py-3">
                        {item.error ? (
                          <p className="truncate text-xs text-red-600" title={item.error}>{item.error}</p>
                        ) : (
                          <span className="text-xs text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {item.content_id && <Link href={`/contents/${item.content_id}`} className="text-xs font-medium text-gray-900 hover:underline">Revisar página</Link>}
                          {item.status === 'failed' && (
                            <button onClick={() => void retryItem(item)} className="text-xs font-medium text-gray-700 hover:underline">
                              Regenerar
                            </button>
                          )}
                          <button onClick={() => void deleteQueueItem(item)} className="text-xs font-medium text-red-500 hover:underline">
                            Remover da fila
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  contentItems.map((content) => (
                    <tr key={content.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedPageIds.has(content.id)}
                          onChange={() => toggleSelected(content.id)}
                          className="h-4 w-4 accent-gray-900"
                        />
                      </td>
                      <td className="px-4 py-3"><ReviewStatusBadge status={content.status} /></td>
                      <td className="px-4 py-3">
                        <div className="min-w-[220px]">
                          <p className="font-medium text-gray-900">{content.main_keyword}</p>
                          <p className="text-xs text-gray-400">{content.service}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-700">{content.city || '-'}</td>
                      <td className="px-4 py-3"><ScoreBadge score={content.score} /></td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(content.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link href={`/contents/${content.id}`} className="text-xs font-medium text-gray-700 hover:underline">
                            Revisar
                          </Link>
                          {content.status === 'draft' && (
                            <button onClick={() => void approveContentItem(content)} className="text-xs font-medium text-gray-700 hover:underline">
                              Aprovar
                            </button>
                          )}
                          {content.status === 'approved' && (
                            <button onClick={() => void publishContentItem(content)} className="text-xs font-medium text-gray-700 hover:underline">
                              Publicar
                            </button>
                          )}
                          {content.status === 'published' ? <span className="text-xs text-gray-400">Publicada, não apagável</span> :
                            <button onClick={() => toast('Excluir esta página?', {
                              action: { label: 'Confirmar', onClick: () => void performBulkDelete([content.id]) },
                              cancel: { label: 'Cancelar', onClick: () => {} },
                            })} className="text-xs font-medium text-red-500 hover:underline">Excluir</button>}
                          {(content.external_page_url || content.wp_post_url) && <a href={content.external_page_url || content.wp_post_url!} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline">Ver página ↗</a>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs text-gray-400">
                Pagina {page} de {totalPages}
              </p>
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Itens por pagina
                <select
                  value={pageLimit}
                  onChange={(event) => {
                    setPageLimit(Number(event.target.value));
                    setPage(1);
                  }}
                  className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700"
                >
                  {PAGE_LIMIT_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1}
                className="bib-btn bib-btn-secondary text-xs"
              >
                Anterior
              </button>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages}
                className="bib-btn bib-btn-secondary text-xs"
              >
                Proxima
              </button>
            </div>
          </div>
        </div>
      </div>

      <NewGenerationModal
        open={modalOpen}
        initialServiceId={serviceId || requestedServiceId}
        initialPageKind={requestedCreateMain ? 'main' : 'locality'}
        siteId={selectedSiteId}
        services={services}
        regions={regions}
        onClose={() => setModalOpen(false)}
        onCreated={(createdServiceId, count, pageKind) => {
          setServiceId(createdServiceId);
          if (pageKind === 'main') return;
          setActiveView('production');
          setSelectedProductionStatuses(['pending']);
          setSelectedReviewStatuses([]);
          setSelectedModes(ALL_MODES);
          setPeriod('all');
          setFromDate('');
          setToDate('');
          setPage(1);
          setAppliedFilters(
            buildQueueFilters({
              selectedSiteId,
              serviceId: createdServiceId,
              selectedStatuses: ['pending'],
              selectedModes: ALL_MODES,
              period: 'all',
              fromDate: '',
              toDate: '',
              selectedLocality: null,
              cityQuery: '',
            }),
          );
          toast.success(`${count} cidade(s) adicionada(s) à fila.`);
        }}
        onMainCreated={(createdServiceId) => {
          setServiceId(createdServiceId);
          setActiveView('review');
          setPeriod('all');
          setCityQuery('');
          setSelectedLocality(null);
          setSelectedProductionStatuses([]);
          setSelectedReviewStatuses(['draft']);
          setPage(1);
          setAppliedFilters(
            buildQueueFilters({
              selectedSiteId,
              serviceId: createdServiceId,
              selectedStatuses: [],
              selectedModes: ALL_MODES,
              period: 'all',
              fromDate: '',
              toDate: '',
              selectedLocality: null,
              cityQuery: '',
            }),
          );
          void loadPage(true);
        }}
      />
    </div>
  );
}

export default function ScalePage() {
  return (
    <Suspense>
      <ScalePageContent />
    </Suspense>
  );
}
