'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Content,
  RelatedService,
  Service,
  Site,
  WpCategory,
} from '@/lib/types';
import { useGeneration } from '@/app/_components/GenerationProvider';
import MediaPickerModal from '@/app/_components/MediaPickerModal';
import { ContentSectionsPanel } from '@/app/_components/ContentSectionsPanel';
import { WhitelabelSectionPreview } from '@/app/_components/WhitelabelSectionPreview';
import { ScoreCard } from '@/app/generate/_components/ScoreCard';
import {
  PreviewPane,
  buildPreviewHtml,
} from '@/app/generate/_components/PreviewPane';

function initImages(stored: string[] | null): string[] {
  const base = stored ?? [];
  return Array.from({ length: 8 }, (_, index) => base[index] ?? '');
}

interface RelatedServiceDraft {
  name: string;
  url: string;
  serviceId: string;
  useService: boolean;
}

function initRelated(stored: RelatedService[] | null): RelatedServiceDraft[] {
  if (!stored?.length) {
    return [{ name: '', url: '', serviceId: '', useService: false }];
  }

  return stored.map((item) => ({
    name: item.name,
    url: item.url,
    serviceId: '',
    useService: false,
  }));
}

function normalizeBaseUrl(site: Site | null): string {
  if (!site) return '';
  return (site.wordpress_base_url?.trim() || `https://${site.domain}`).replace(
    /\/+$/,
    '',
  );
}

function buildServiceUrl(site: Site | null, service: Service | null): string {
  if (!site || !service) return '';
  return `${normalizeBaseUrl(site)}/${service.slug}/`;
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
  published: 'Publicado',
};

const STATUS_DOT: Record<string, string> = {
  draft: 'bg-gray-300',
  approved: 'bg-amber-400',
  published: 'bg-emerald-500',
};

function Divider() {
  return <div className="border-t border-gray-100" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1.5 block text-xs font-medium text-gray-600">
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 ${props.className ?? ''}`}
    />
  );
}

interface Props {
  initialContent?: Content;
}

export function UnifiedLayout({ initialContent }: Props) {
  const router = useRouter();
  const { addJob, isQueueActive } = useGeneration();
  const isEditing = Boolean(initialContent);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(
    initialContent ?? null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [selectedSectionKey, setSelectedSectionKey] = useState('');
  const [sectionsRefreshKey, setSectionsRefreshKey] = useState(0);

  const [selectedSiteId, setSelectedSiteId] = useState(
    initialContent?.site_id ?? '',
  );
  const [site, setSite] = useState<Site | null>(null);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [baseServiceId, setBaseServiceId] = useState('');
  const [importServiceId, setImportServiceId] = useState('');

  const [service, setService] = useState(initialContent?.service ?? '');
  const [city, setCity] = useState(initialContent?.city ?? '');
  const [keyword, setKeyword] = useState(
    initialContent &&
      initialContent.main_keyword !==
        `${initialContent.service} em ${initialContent.city}`
      ? initialContent.main_keyword
      : '',
  );
  const [videoUrl, setVideoUrl] = useState(initialContent?.video_url ?? '');
  const [images, setImages] = useState(() =>
    initImages(initialContent?.images ?? null),
  );
  const [relatedServices, setRelatedServices] = useState<RelatedServiceDraft[]>(
    () => initRelated(initialContent?.related_services ?? null),
  );
  const [wpCategory, setWpCategory] = useState(
    initialContent?.wordpress_category ?? '',
  );
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [localityNotes, setLocalityNotes] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [feedback, setFeedback] = useState('');
  const [mediaModal, setMediaModal] = useState<{
    open: boolean;
    mode: 'video' | 'images';
  } | null>(null);

  const autoKeyword = service ? (city ? `${service} em ${city}` : service) : '';
  const effectiveKeyword = keyword || autoKeyword;

  const selectedBaseService = useMemo(
    () => availableServices.find((item) => item.id === baseServiceId) ?? null,
    [availableServices, baseServiceId],
  );

  useEffect(() => {
    if (initialContent?.site_id) return;

    const stored = window.localStorage.getItem('bib-selected-site-id') ?? '';
    setSelectedSiteId(stored);

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'bib-selected-site-id')
        setSelectedSiteId(event.newValue ?? '');
    };

    const onSelected = (event: Event) => {
      setSelectedSiteId(
        (event as CustomEvent<{ siteId: string }>).detail?.siteId ?? '',
      );
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('bib-site-selected', onSelected);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('bib-site-selected', onSelected);
    };
  }, [initialContent?.site_id]);

  useEffect(() => {
    if (!selectedSiteId) {
      setSite(null);
      setAvailableServices([]);
      setBaseServiceId('');
      setImportServiceId('');
      setWpCategories([]);
      return;
    }

    api
      .getSite(selectedSiteId)
      .then(setSite)
      .catch(() => setSite(null));
    api
      .listServices(selectedSiteId)
      .then(setAvailableServices)
      .catch(() => setAvailableServices([]));
    api
      .getWpCategories(selectedSiteId)
      .then(setWpCategories)
      .catch(() => setWpCategories([]));
  }, [selectedSiteId]);

  function updateImage(index: number, value: string) {
    setImages((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? value : item,
      ),
    );
  }

  function addRelated() {
    setRelatedServices((current) => [
      ...current,
      { name: '', url: '', serviceId: '', useService: false },
    ]);
  }

  function removeRelated(index: number) {
    setRelatedServices((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  }

  function updateRelatedName(index: number, value: string) {
    setRelatedServices((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, name: value } : item,
      ),
    );
  }

  function updateRelatedUrl(index: number, value: string) {
    setRelatedServices((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index ? { ...item, url: value, serviceId: '' } : item,
      ),
    );
  }

  function toggleRelatedService(index: number, checked: boolean) {
    setRelatedServices((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              useService: checked,
              serviceId: checked ? item.serviceId : '',
              url: checked ? item.url : '',
            }
          : item,
      ),
    );
  }

  function updateRelatedLinkedService(index: number, serviceId: string) {
    const linked =
      availableServices.find((item) => item.id === serviceId) ?? null;
    const resolvedUrl = buildServiceUrl(site, linked);

    setRelatedServices((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              serviceId,
              url: resolvedUrl,
              name: item.name.trim() ? item.name : (linked?.name ?? ''),
            }
          : item,
      ),
    );
  }

  function importRelatedFromService(serviceId: string) {
    const importedService =
      availableServices.find((item) => item.id === serviceId) ?? null;
    if (!importedService) return;

    const imported =
      importedService.related_services?.length > 0
        ? importedService.related_services.map((item) => ({
            name: item.name,
            url: item.url,
            serviceId: '',
            useService: false,
          }))
        : [{ name: '', url: '', serviceId: '', useService: false }];

    setRelatedServices(imported);
    toast.success(
      `Serviços complementares importados de "${importedService.name}".`,
    );
  }

  function handleBaseServiceChange(serviceId: string) {
    setBaseServiceId(serviceId);

    const selected =
      availableServices.find((item) => item.id === serviceId) ?? null;
    if (!selected) {
      return;
    }

    setService(selected.name);
    setWpCategory((current) => current || selected.wordpress_category || '');
    setVideoUrl(selected.video_url ?? '');
    setImages(initImages(selected.images ?? []));
    setServiceNotes((current) => current || selected.service_notes || '');
  }

  function buildGeneratePayload() {
    const validRelated = relatedServices
      .map((item) => {
        const name = item.name.trim();
        if (!name) return null;

        if (item.useService) {
          const linked =
            availableServices.find(
              (serviceItem) => serviceItem.id === item.serviceId,
            ) ?? null;
          const resolvedUrl = buildServiceUrl(site, linked);
          return resolvedUrl ? { name, url: resolvedUrl } : null;
        }

        const url = item.url.trim();
        return url ? { name, url } : null;
      })
      .filter((item): item is RelatedService => Boolean(item));

    const hasAnyImage = images.some((item) => item.trim());

    return {
      main_keyword: effectiveKeyword,
      service,
      city: city || undefined,
      min_words: 5000 as const,
      related_services: validRelated.length > 0 ? validRelated : undefined,
      images: hasAnyImage ? images : undefined,
      video_url: videoUrl.trim() || undefined,
      locality_notes: localityNotes.trim() || undefined,
      service_notes: serviceNotes.trim() || undefined,
      skip_backlinks: true as const,
      wordpress_category: wpCategory || undefined,
      site_id: selectedSiteId || undefined,
    };
  }

  function handleGenerate(event: React.FormEvent) {
    event.preventDefault();

    if (!selectedSiteId) {
      toast.error('Seleciona um site no menu superior antes de gerar.');
      return;
    }

    const label = effectiveKeyword || service;
    addJob('generate', buildGeneratePayload(), label);
    toast.info(`"${label}" adicionada à fila de geração.`);
  }

  function handleRegenerate(event: React.FormEvent) {
    event.preventDefault();
    if (!content) return;

    addJob(
      'regenerate',
      {
        content_id: content.id,
        ...buildGeneratePayload(),
        feedback: feedback || undefined,
      },
      content.main_keyword,
    );

    setShowRegenerate(false);
    setFeedback('');
    toast.info(`Regeneração de "${content.main_keyword}" adicionada à fila.`);
  }

  async function handleApprove() {
    if (!content) return;

    setActionLoading(true);
    setError(null);

    try {
      const result = await api.approveContent(content.id);
      setContent(result);
      toast.success('Página aprovada.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao aprovar';
      setError(message);
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handlePublish() {
    if (!content) return;

    setActionLoading(true);
    setError(null);

    try {
      const result = await api.publishContent(content.id);
      setContent(result);
      toast.success(
        content.output_format === 'whitelabel_json'
          ? 'Publicado via API.'
          : 'Publicado no WordPress.',
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao publicar';
      setError(message);
      toast.error(message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!content) return;

    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    setActionLoading(true);

    try {
      await api.deleteContent(content.id);
      toast.success('Página apagada.');
      router.push('/contents');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao apagar';
      setError(message);
      toast.error(message);
      setActionLoading(false);
      setConfirmDelete(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && (
        <aside className="flex w-[400px] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-5">
            <div className="flex items-center gap-2">
              <Link
                href="/contents"
                className="flex items-center gap-0.5 text-xs text-gray-400 transition-colors hover:text-gray-700"
              >
                ← Conteúdos
              </Link>
              <span className="text-gray-200">|</span>
              {content && (
                <span
                  className={`h-2 w-2 rounded-full ${STATUS_DOT[content.status]}`}
                />
              )}
              <span className="truncate text-sm font-semibold text-gray-900">
                {content ? content.main_keyword : 'Nova página SEO'}
              </span>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Ocultar painel"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 12L6 8l4-4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>

          {content && (
            <div className="shrink-0 space-y-3 border-b border-gray-100 px-5 py-4">
              <ScoreCard content={content} />

              <div className="flex flex-wrap gap-2">
                {content.status === 'draft' && (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
                  >
                    Aprovar
                  </button>
                )}
                {content.status === 'approved' && (
                  <button
                    onClick={handlePublish}
                    disabled={actionLoading}
                    className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
                  >
                    {content.output_format === 'whitelabel_json'
                      ? 'Publicar via API'
                      : 'Publicar no WordPress'}
                  </button>
                )}
                {content.status === 'published' &&
                  (content.wp_post_url || content.external_page_url) && (
                    <a
                      href={
                        content.external_page_url ?? content.wp_post_url ?? '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-50"
                    >
                      Ver página ↗
                    </a>
                  )}
                <button
                  onClick={() => setShowRegenerate((value) => !value)}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50"
                >
                  {showRegenerate ? 'Fechar' : 'Regenerar'}
                </button>
              </div>

              {showRegenerate && (
                <form onSubmit={handleRegenerate} className="space-y-2">
                  <textarea
                    value={feedback}
                    onChange={(event) => setFeedback(event.target.value)}
                    placeholder="Feedback opcional"
                    rows={2}
                    className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                  />
                  <button
                    type="submit"
                    className="w-full rounded-lg bg-gray-900 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800"
                  >
                    {isQueueActive
                      ? 'Adicionar à fila'
                      : 'Regenerar com alterações do formulário'}
                  </button>
                </form>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-500">
                  <span
                    className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${STATUS_DOT[content.status]}`}
                  />
                  {STATUS_LABEL[content.status] ?? content.status}
                </span>
                {content.status === 'published' ? (
                  <span className="text-xs text-gray-400">
                    Publicada, não apagável
                  </span>
                ) : confirmDelete ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                    >
                      {actionLoading ? '...' : 'Confirmar'}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDelete}
                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                  >
                    Apagar
                  </button>
                )}
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {content && (
              <div className="mb-4">
                <ContentSectionsPanel
                  content={content}
                  onContentUpdated={setContent}
                  onSectionUpdated={() =>
                    setSectionsRefreshKey((value) => value + 1)
                  }
                  selectedSectionKey={selectedSectionKey}
                  onSelectedSectionChange={setSelectedSectionKey}
                />
              </div>
            )}

            <form
              onSubmit={
                isEditing || content
                  ? (event) => event.preventDefault()
                  : handleGenerate
              }
              className="space-y-4"
            >
              <div className="space-y-3">
                <div>
                  <Label>
                    Serviço base{' '}
                    <span className="font-normal text-gray-400">
                      (opcional)
                    </span>
                  </Label>
                  <select
                    value={baseServiceId}
                    onChange={(event) =>
                      handleBaseServiceChange(event.target.value)
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                    disabled={!selectedSiteId || availableServices.length === 0}
                  >
                    <option value="">Selecionar serviço existente</option>
                    {availableServices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {selectedBaseService && (
                    <p className="mt-1 text-xs text-gray-400">
                      Serviço base selecionado para reaproveitar nome,
                      categoria, vídeo e imagens.
                    </p>
                  )}
                </div>

                <div>
                  <Label>Serviço *</Label>
                  <Input
                    required
                    value={service}
                    onChange={(event) => setService(event.target.value)}
                    placeholder="ex: Reparação de Janelas"
                  />
                </div>

                <div>
                  <Label>
                    Cidade{' '}
                    <span className="font-normal text-gray-400">
                      (opcional)
                    </span>
                  </Label>
                  <Input
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                    placeholder="ex: Lisboa"
                  />
                </div>

                <div>
                  <Label>
                    Palavra-chave{' '}
                    <span className="font-normal text-gray-400">
                      (auto: "{autoKeyword || 'Serviço'}")
                    </span>
                  </Label>
                  <Input
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    placeholder={autoKeyword || 'Deixar em branco para auto'}
                  />
                </div>
              </div>

              <div>
                <Label>
                  Categoria WordPress{' '}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </Label>
                <select
                  value={wpCategory}
                  onChange={(event) => setWpCategory(event.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                >
                  <option value="">Apenas Blog (padrão)</option>
                  {wpCategories.map((item) => (
                    <option key={item.id} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>

              <Divider />

              <div>
                <Label>
                  URL do Vídeo{' '}
                  <span className="font-normal text-gray-400">
                    (MP4 no topo da página)
                  </span>
                </Label>
                <div className="flex gap-2">
                  <Input
                    value={videoUrl}
                    onChange={(event) => setVideoUrl(event.target.value)}
                    placeholder="https://site.pt/wp-content/.../video.mp4"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaModal({ open: true, mode: 'video' })}
                    className="shrink-0 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    Escolher
                  </button>
                </div>
              </div>

              <div>
                <Label>
                  Imagens{' '}
                  <span className="font-normal text-gray-400">
                    ({images.filter(Boolean).length}/8 selecionadas)
                  </span>
                </Label>
                <button
                  type="button"
                  onClick={() => setMediaModal({ open: true, mode: 'images' })}
                  className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-3 text-center text-sm text-gray-500 transition-colors hover:border-gray-400 hover:bg-gray-50"
                >
                  {images.filter(Boolean).length > 0
                    ? `${images.filter(Boolean).length} imagem(ns) - clique para alterar`
                    : 'Escolher imagens da biblioteca WordPress'}
                </button>
                {images.filter(Boolean).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {images.filter(Boolean).map((url, index) => (
                      <div
                        key={index}
                        className="relative h-14 w-14 overflow-hidden rounded border border-gray-200"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Imagem ${index + 1}`}
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute left-0 top-0 flex h-4 w-4 items-center justify-center rounded-br bg-gray-900 text-[10px] text-white">
                          {index + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p className="mt-1.5 text-xs text-gray-400">
                  Posições preservadas conforme a ordem de seleção.
                </p>
              </div>

              <Divider />

              <div>
                <Label>
                  Contexto da localidade{' '}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </Label>
                <textarea
                  value={localityNotes}
                  onChange={(event) => setLocalityNotes(event.target.value)}
                  placeholder="ex: Cidade histórica, bairros relevantes, ruas e referências reais"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>

              <div>
                <Label>
                  Contexto do serviço{' '}
                  <span className="font-normal text-gray-400">(opcional)</span>
                </Label>
                <textarea
                  value={serviceNotes}
                  onChange={(event) => setServiceNotes(event.target.value)}
                  placeholder="ex: Ferramentas, marcas, técnicas e notas que a IA deve considerar"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                />
              </div>

              <Divider />

              <div className="space-y-3">
                <div>
                  <Label>
                    Importar de Serviço{' '}
                    <span className="font-normal text-gray-400">
                      (traz títulos e URLs já cadastrados)
                    </span>
                  </Label>
                  <div className="flex gap-2">
                    <select
                      value={importServiceId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setImportServiceId(nextId);
                        if (nextId) importRelatedFromService(nextId);
                      }}
                      className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                      disabled={
                        !selectedSiteId || availableServices.length === 0
                      }
                    >
                      <option value="">Selecionar serviço para importar</option>
                      {availableServices.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <Label>
                    Serviços complementares{' '}
                    <span className="font-normal text-gray-400">
                      (links internos)
                    </span>
                  </Label>
                  <div className="space-y-3">
                    {relatedServices.map((item, index) => (
                      <div
                        key={index}
                        className="space-y-2 rounded-lg border border-gray-200 p-3"
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1">
                            <Label>Título</Label>
                            <Input
                              value={item.name}
                              onChange={(event) =>
                                updateRelatedName(index, event.target.value)
                              }
                              placeholder="ex: Reparação de Portas"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => removeRelated(index)}
                            className="mt-6 shrink-0 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-400 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                          >
                            Remover
                          </button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <Label>
                              {item.useService ? 'Serviço relacionado' : 'URL'}
                            </Label>
                            <label className="flex items-center gap-2 text-xs text-gray-500">
                              <input
                                type="checkbox"
                                checked={item.useService}
                                onChange={(event) =>
                                  toggleRelatedService(
                                    index,
                                    event.target.checked,
                                  )
                                }
                              />
                              Serviço
                            </label>
                          </div>

                          {item.useService ? (
                            <select
                              value={item.serviceId}
                              onChange={(event) =>
                                updateRelatedLinkedService(
                                  index,
                                  event.target.value,
                                )
                              }
                              className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
                            >
                              <option value="">
                                Selecionar serviço existente
                              </option>
                              {availableServices.map((serviceItem) => (
                                <option
                                  key={serviceItem.id}
                                  value={serviceItem.id}
                                >
                                  {serviceItem.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              value={item.url}
                              onChange={(event) =>
                                updateRelatedUrl(index, event.target.value)
                              }
                              placeholder="https://site.pt/reparacao-de-portas/"
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={addRelated}
                    className="mt-2 text-xs text-gray-500 transition-colors hover:text-gray-800"
                  >
                    + Adicionar serviço complementar
                  </button>
                </div>
              </div>

              {!content && (
                <button
                  type="submit"
                  className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-800"
                >
                  {isQueueActive ? 'Adicionar à fila' : 'Gerar Página'}
                </button>
              )}
            </form>
          </div>
        </aside>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-5">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path
                  d="M6 4l4 4-4 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Painel
            </button>
          )}

          <span className="flex-1 truncate text-xs text-gray-400">
            {content
              ? content.main_keyword
              : 'Preenche o formulário e clica em Gerar Página'}
          </span>

          {content?.html && content.output_format !== 'whitelabel_json' && (
            <button
              onClick={() => {
                navigator.clipboard
                  .writeText(
                    buildPreviewHtml(
                      content.html ?? '',
                      videoUrl || undefined,
                      content.generation_mode,
                    ),
                  )
                  .then(() =>
                    toast.success('HTML copiado para a área de transferência.'),
                  )
                  .catch(() => toast.error('Não foi possível copiar o HTML.'));
              }}
              className="shrink-0 rounded-md border border-gray-200 px-2.5 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              Copiar HTML
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {content?.output_format === 'whitelabel_json' ? (
            <WhitelabelSectionPreview
              content={content}
              refreshKey={sectionsRefreshKey}
              selectedSectionKey={selectedSectionKey}
              onSectionSelect={setSelectedSectionKey}
            />
          ) : (
            <PreviewPane
              html={content?.html ?? null}
              videoUrl={videoUrl}
              loading={false}
              generationMode={content?.generation_mode}
              interactiveSections={Boolean(content?.html)}
              selectedSectionKey={selectedSectionKey}
              onSectionSelect={setSelectedSectionKey}
              onSectionEdit={setSelectedSectionKey}
            />
          )}
        </div>
      </div>

      {mediaModal?.open && (
        <MediaPickerModal
          isOpen
          onClose={() => setMediaModal(null)}
          mode={mediaModal.mode}
          siteId={selectedSiteId}
          onConfirmVideo={(url) => {
            setVideoUrl(url);
            setMediaModal(null);
          }}
          onConfirmImages={(urls) => {
            setImages(
              Array.from({ length: 8 }, (_, index) => urls[index] ?? ''),
            );
            setMediaModal(null);
          }}
          initialVideoUrl={videoUrl}
          initialImages={images.filter(Boolean)}
        />
      )}
    </div>
  );
}
