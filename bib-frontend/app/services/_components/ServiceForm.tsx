'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Service,
  CreateServiceInput,
  RelatedService,
  WpCategory,
  Site,
} from '@/lib/types';
import MediaPickerModal from '@/app/_components/MediaPickerModal';

interface ServiceFormProps {
  initialData?: Service;
  siteId?: string;
}

interface RelatedServiceDraft {
  name: string;
  url: string;
  serviceId: string;
  useService: boolean;
}

function initRelatedServices(stored: RelatedService[] | null | undefined): RelatedServiceDraft[] {
  return (stored ?? []).map((item) => ({
    name: item.name,
    url: item.url,
    serviceId: '',
    useService: false,
  }));
}

function normalizeBaseUrl(site: Site | null): string {
  if (!site) return '';
  return (site.wordpress_base_url?.trim() || `https://${site.domain}`).replace(/\/+$/, '');
}

function buildServiceUrl(site: Site | null, service: Service | null): string {
  if (!site || !service) return '';
  return `${normalizeBaseUrl(site)}/${service.slug}/`;
}

export default function ServiceForm({ initialData, siteId }: ServiceFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? '');
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [relatedServices, setRelatedServices] = useState<RelatedServiceDraft[]>(
    () => initRelatedServices(initialData?.related_services),
  );
  const [serviceNotes, setServiceNotes] = useState(initialData?.service_notes ?? '');
  const [tone, setTone] = useState(initialData?.tone ?? '');
  const [minWords, setMinWords] = useState(initialData?.min_words ?? 5000);
  const [wordpressCategory, setWordpressCategory] = useState(initialData?.wordpress_category ?? '');
  const [seoTitle, setSeoTitle] = useState(initialData?.seo_title ?? '');
  const [seoDescription, setSeoDescription] = useState(initialData?.seo_description ?? '');
  const [featuredImageAssetId, setFeaturedImageAssetId] = useState(initialData?.featured_image_asset_id ?? '');
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initialData?.featured_image_url ?? '');
  const [featuredImageAlt, setFeaturedImageAlt] = useState(initialData?.featured_image_alt ?? '');
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [site, setSite] = useState<Site | null>(null);
  const [availableServices, setAvailableServices] = useState<Service[]>([]);
  const [importServiceId, setImportServiceId] = useState('');
  const [wpCatLoading, setWpCatLoading] = useState(false);
  const [wpCatError, setWpCatError] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const [mediaModal, setMediaModal] = useState<{ open: boolean; mode: 'video' | 'images'; target?: 'gallery' | 'featured' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncingImage, setSyncingImage] = useState(false);
  const [error, setError] = useState('');
  const effectiveSiteId = initialData?.site_id ?? siteId;
  const isWhitelabel = site?.integration_type === 'whitelabel_api';
  const availableRelatedServices = availableServices.filter(
    (item) => item.id !== initialData?.id,
  );

  useEffect(() => {
    if (!effectiveSiteId) return;
    api.getSite(effectiveSiteId).then(setSite).catch(() => {});
  }, [effectiveSiteId]);

  useEffect(() => {
    if (!effectiveSiteId) {
      setAvailableServices([]);
      setImportServiceId('');
      return;
    }
    api.listServices(effectiveSiteId)
      .then((items) => setAvailableServices(items))
      .catch(() => setAvailableServices([]));
  }, [effectiveSiteId]);

  useEffect(() => {
    if (effectiveSiteId && !site) return;
    if (isWhitelabel) return;
    setWpCatLoading(true);
    if (!effectiveSiteId) return;
    api.getWpCategories(effectiveSiteId)
      .then(setWpCategories)
      .catch((err: Error) => setWpCatError(err.message))
      .finally(() => setWpCatLoading(false));
  }, [effectiveSiteId, isWhitelabel, site]);

  function addRelated() {
    setRelatedServices((prev) => [...prev, { name: '', url: '', serviceId: '', useService: false }]);
  }
  function removeRelated(i: number) {
    setRelatedServices((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateRelatedName(i: number, value: string) {
    setRelatedServices((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, name: value } : r)),
    );
  }
  function updateRelatedUrl(i: number, value: string) {
    setRelatedServices((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, url: value, serviceId: '' } : r)),
    );
  }
  function toggleRelatedService(i: number, checked: boolean) {
    setRelatedServices((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              useService: checked,
              serviceId: checked ? r.serviceId : '',
              url: checked ? r.url : '',
            }
          : r,
      ),
    );
  }
  function updateRelatedLinkedService(i: number, serviceId: string) {
    const linked = availableRelatedServices.find((item) => item.id === serviceId) ?? null;
    const resolvedUrl = buildServiceUrl(site, linked);

    setRelatedServices((prev) =>
      prev.map((r, idx) =>
        idx === i
          ? {
              ...r,
              serviceId,
              url: resolvedUrl,
              name: r.name.trim() ? r.name : (linked?.name ?? ''),
            }
          : r,
      ),
    );
  }
  function importRelatedFromService(serviceId: string) {
    const importedService = availableRelatedServices.find((item) => item.id === serviceId) ?? null;
    if (!importedService) return;

    const imported = importedService.related_services?.length
      ? initRelatedServices(importedService.related_services)
      : [];

    setRelatedServices(imported);
    toast.success(`Servicos complementares importados de "${importedService.name}".`);
  }
  function buildRelatedServicesPayload(): RelatedService[] {
    return relatedServices
      .map((item) => {
        const relatedName = item.name.trim();
        if (!relatedName) return null;

        if (item.useService) {
          const linked = availableRelatedServices.find((service) => service.id === item.serviceId) ?? null;
          const resolvedUrl = buildServiceUrl(site, linked);
          return resolvedUrl ? { name: relatedName, url: resolvedUrl } : null;
        }

        const relatedUrl = item.url.trim();
        return relatedUrl ? { name: relatedName, url: relatedUrl } : null;
      })
      .filter((item): item is RelatedService => Boolean(item));
  }

  async function handleSyncFeaturedImageOnly() {
    if (!isEdit || !initialData || !effectiveSiteId) return;
    if (!featuredImageAssetId) {
      const msg = 'Selecione uma imagem principal antes de sincronizar.';
      setError(msg);
      toast.error(msg);
      return;
    }

    setSyncingImage(true);
    setError('');
    try {
      await api.updateService(initialData.id, {
        featured_image_asset_id: featuredImageAssetId || null,
        featured_image_alt: featuredImageAlt.trim() || null,
      });
      await api.syncWhitelabelServiceImage(effectiveSiteId, initialData.id);
      toast.success('Imagem sincronizada no WhiteLabel.');
      router.refresh();
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      toast.error(msg);
    } finally {
      setSyncingImage(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('O nome é obrigatório.'); return; }
    setLoading(true);
    setError('');

    const input: CreateServiceInput = {
      name: name.trim(),
      site_id: effectiveSiteId ?? null,
      video_url: videoUrl || null,
      images,
      related_services: buildRelatedServicesPayload(),
      service_notes: serviceNotes || null,
      tone: tone,
      min_words: minWords,
      wordpress_category: wordpressCategory || null,
      featured_image_asset_id: featuredImageAssetId || null,
      featured_image_alt: featuredImageAlt.trim() || null,
      seo_title: seoTitle.trim() || null,
      seo_description: seoDescription.trim() || null,
    };

    try {
      if (isEdit && initialData) {
        const service = await api.updateService(initialData.id, input);
        let syncMessage = '';
        if (isWhitelabel && effectiveSiteId && featuredImageAssetId) {
          try {
            await api.syncWhitelabelServiceImage(effectiveSiteId, service.id);
            syncMessage = ' Imagem sincronizada no WhiteLabel.';
          } catch (syncErr) {
            toast.error(`Serviço guardado, mas a imagem não foi sincronizada: ${(syncErr as Error).message}`);
          }
        }
        toast.success(`Serviço guardado com sucesso!${syncMessage}`);
        router.refresh();
      } else {
        const service = await api.createService(input);
        toast.success("Serviço criado com sucesso!");
        router.push(`/services/${service.id}`);
      }
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
      {isWhitelabel && (
        <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          Este serviço pertence a um site API Whitelabel. Os templates gerados serão textuais/JSON e publicados pela API do site.
        </p>
      )}

      {/* Nome */}
      <div>
        <label className="bib-label">
          Nome do Serviço <span className="bib-label-hint">(obrigatório)</span>
        </label>
        <input
          className="bib-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex: Canalizadores"
          required
        />
      </div>

      <div className="bib-divider" />

      {isWhitelabel && (
        <>
          <div>
            <label className="bib-label">
              Imagem principal WhiteLabel <span className="bib-label-hint">(enviada na criação do serviço)</span>
            </label>
            <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
              <div className="w-24 h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-50">
                {featuredImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={featuredImageUrl} alt={featuredImageAlt || name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-400 text-center px-2">
                    Sem imagem
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setMediaModal({ open: true, mode: 'images', target: 'featured' })}
                  className="bib-btn bib-btn-secondary text-xs"
                >
                  Selecionar / enviar imagem
                </button>
                <input
                  className="bib-input"
                  value={featuredImageAlt}
                  onChange={(e) => setFeaturedImageAlt(e.target.value)}
                  placeholder="Alt da imagem principal"
                />
                <p className="text-xs text-gray-400">
                  Esta imagem será enviada para a API WhiteLabel no endpoint da página principal do serviço.
                </p>
                {isEdit && initialData && (
                  <button
                    type="button"
                    disabled={syncingImage || !featuredImageAssetId}
                    onClick={() => void handleSyncFeaturedImageOnly()}
                    className="bib-btn bib-btn-primary text-xs disabled:opacity-50"
                  >
                    {syncingImage ? 'A sincronizar imagem...' : 'Subir apenas imagem'}
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="bib-divider" />
        </>
      )}

      {/* Vídeo */}
      <div>
        <label className="bib-label">
          URL do Vídeo <span className="bib-label-hint">(MP4 — topo da página)</span>
        </label>
        <div className="flex gap-2">
          <input
            className="bib-input"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="https://..."
          />
          <button
            type="button"
            onClick={() => setMediaModal({ open: true, mode: 'video', target: 'gallery' })}
            className="bib-btn bib-btn-secondary shrink-0 text-xs px-3"
          >
            Escolher
          </button>
        </div>
      </div>

      {/* Imagens */}
      <div>
        <label className="bib-label">
          Imagens <span className="bib-label-hint">({images.filter(Boolean).length}/8 selecionadas)</span>
        </label>
        <button
          type="button"
          onClick={() => setMediaModal({ open: true, mode: 'images', target: 'gallery' })}
          className="w-full text-sm border border-dashed border-gray-300 rounded-lg px-3 py-3 text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors text-center"
        >
          {images.filter(Boolean).length > 0
            ? `${images.filter(Boolean).length} imagem(ns) selecionada(s) — clique para alterar`
            : `Escolher Imagens da Biblioteca ${isWhitelabel ? 'WhiteLabel' : 'WordPress'}`}
        </button>
        {images.filter(Boolean).length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {images.filter(Boolean).map((url, i) => (
              <div key={i} className="relative w-14 h-14 rounded overflow-hidden border border-gray-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Imagem ${i + 1}`} className="w-full h-full object-cover" />
                <span className="absolute top-0 left-0 bg-gray-900 text-white text-[10px] w-4 h-4 flex items-center justify-center rounded-br">
                  {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bib-divider" />

      {/* Notas */}
      <div>
        <label className="bib-label">
          Notas / Contexto do Serviço <span className="bib-label-hint">(opcional)</span>
        </label>
        <textarea
          className="bib-textarea"
          value={serviceNotes}
          onChange={(e) => setServiceNotes(e.target.value)}
          rows={3}
          placeholder="Informações adicionais para a IA sobre este serviço..."
        />
        <p className="mt-1 text-xs text-gray-400">
          Ferramentas, marcas e técnicas específicas — a IA integrará estas referências nas secções técnicas.
        </p>
      </div>

      {/* Tom */}
      <div>
        <label className="bib-label">
          Tom <span className="bib-label-hint">(opcional)</span>
        </label>
        <input
          className="bib-input"
          value={tone}
          onChange={(e) => setTone(e.target.value)}
          placeholder="profissional, confiável e direto"
        />
      </div>

      {/* Palavras mínimas */}
      <div>
        <label className="bib-label">Palavras Mínimas</label>
        <input
          type="number"
          className="bib-input"
          value={minWords}
          onChange={(e) => setMinWords(Number(e.target.value))}
          min={100}
          max={10000}
        />
      </div>

      <div className="bib-divider" />

      <div>
        <label className="bib-label">
          Importar de Servico <span className="bib-label-hint">(traz titulos e URLs ja cadastrados)</span>
        </label>
        <select
          className="bib-input"
          value={importServiceId}
          onChange={(e) => {
            const nextId = e.target.value;
            setImportServiceId(nextId);
            if (nextId) importRelatedFromService(nextId);
          }}
          disabled={!effectiveSiteId || availableRelatedServices.length === 0}
        >
          <option value="">Selecionar servico para importar</option>
          {availableRelatedServices.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name}
            </option>
          ))}
        </select>
      </div>

      {/* Serviços relacionados */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="bib-label" style={{ marginBottom: 0 }}>
            Serviços Complementares <span className="bib-label-hint">(links internos)</span>
          </label>
          <button
            type="button"
            onClick={addRelated}
            className="bib-btn bib-btn-ghost text-xs"
          >
            + Adicionar
          </button>
        </div>
        <div className="space-y-3">
          {relatedServices.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-3">
              <label className="bib-label">Titulo</label>
              <input
                className="bib-input"
                value={r.name}
                onChange={(e) => updateRelatedName(i, e.target.value)}
                placeholder="ex: Reparacao de Portas"
              />
              <div className="flex items-center justify-between">
                <label className="bib-label" style={{ marginBottom: 0 }}>
                  {r.useService ? 'Servico relacionado' : 'URL'}
                </label>
                <label className="flex items-center gap-2 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={r.useService}
                    onChange={(e) => toggleRelatedService(i, e.target.checked)}
                    disabled={availableRelatedServices.length === 0}
                  />
                  Servico
                </label>
              </div>
              {r.useService ? (
                <select
                  className="bib-input"
                  value={r.serviceId}
                  onChange={(e) => updateRelatedLinkedService(i, e.target.value)}
                  disabled={availableRelatedServices.length === 0}
                >
                  <option value="">Selecionar servico existente</option>
                  {availableRelatedServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="bib-input"
                  value={r.url}
                  onChange={(e) => updateRelatedUrl(i, e.target.value)}
                  placeholder="https://site.pt/reparacao-de-portas/"
                />
              )}
              <button
                type="button"
                onClick={() => removeRelated(i)}
                className="bib-btn bib-btn-ghost text-gray-400 hover:text-red-500 shrink-0 text-xs"
              >
                Remover
              </button>
            </div>
          ))}
          {relatedServices.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum serviço adicionado.</p>
          )}
        </div>
      </div>

      <div className="bib-divider" />

      {!isWhitelabel && (
      <>
      {/* Categoria WordPress */}
      <div>
        <label className="bib-label">
          Categoria WordPress <span className="bib-label-hint">(opcional)</span>
        </label>

        {wpCatLoading ? (
          <p className="text-xs text-gray-400">A carregar categorias...</p>
        ) : wpCatError ? (
          <p className="text-xs text-red-500">{wpCatError}</p>
        ) : (
          <>
            <div className="flex gap-2">
              <select
                className="bib-input"
                value={showNewCategory ? '__new__' : (wordpressCategory || '')}
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setShowNewCategory(true);
                    setWordpressCategory('');
                  } else {
                    setShowNewCategory(false);
                    setWordpressCategory(e.target.value);
                  }
                }}
              >
                <option value="">— Sem categoria —</option>
                {wpCategories
                  .filter((c) => c.name.toLowerCase() !== 'uncategorized')
                  .map((c) => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                <option value="__new__">+ Criar nova categoria...</option>
              </select>
            </div>

            {showNewCategory && (
              <div className="flex gap-2 mt-2">
                <input
                  className="bib-input"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nome da nova categoria"
                  autoFocus
                />
                <button
                  type="button"
                  disabled={!newCategoryName.trim()}
                  onClick={() => {
                    const name = newCategoryName.trim();
                    if (!name) return;
                    setWordpressCategory(name);
                    setShowNewCategory(false);
                    setNewCategoryName('');
                    // Optimistically add to list so it appears selected
                    setWpCategories((prev) =>
                      prev.some((c) => c.name.toLowerCase() === name.toLowerCase())
                        ? prev
                        : [...prev, { id: -1, name, slug: name.toLowerCase(), parent: 0 }],
                    );
                  }}
                  className="bib-btn bib-btn-secondary shrink-0 text-xs px-3"
                >
                  Confirmar
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCategory(false); setNewCategoryName(''); }}
                  className="bib-btn bib-btn-ghost text-xs shrink-0"
                >
                  Cancelar
                </button>
              </div>
            )}

            {wordpressCategory && !showNewCategory && (
              <p className="mt-1 text-xs text-gray-400">
                Será criada/associada automaticamente ao publicar no WordPress.
              </p>
            )}
          </>
        )}
      </div>

      <div className="bib-divider" />
      </>
      )}

      {/* SEO */}
      <div>
        <label className="bib-label">
          SEO — Título <span className="bib-label-hint">(meta title para o WordPress)</span>
        </label>
        <input
          className="bib-input"
          value={seoTitle}
          onChange={(e) => setSeoTitle(e.target.value)}
          placeholder="ex: Reparação de Termoacumuladores em Lisboa – Assistência 24H/7"
          maxLength={70}
        />
        <p className="mt-1 text-xs text-gray-400">
          Use &quot;Lisboa&quot; como cidade — é substituída automaticamente pela cidade real na publicação.
        </p>
      </div>

      <div>
        <label className="bib-label">
          SEO — Descrição <span className="bib-label-hint">(meta description para o WordPress)</span>
        </label>
        <textarea
          className="bib-textarea"
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          rows={2}
          placeholder="ex: Serviço de Reparação de Termoacumuladores em Lisboa 24h/7 - Instalação, Manutenção e Reparação - Sáb, Dom e Feriados."
          maxLength={160}
        />
        <p className="mt-1 text-xs text-gray-400">
          Máximo 160 caracteres. &quot;Lisboa&quot; é substituída pela cidade real na publicação.
        </p>
      </div>

      {/* Template */}
      {isEdit && initialData && (
        <>
          <div className="bib-divider" />
          <div>
            <label className="bib-label">Template HTML do Serviço</label>
            <p className="text-xs text-gray-400 mb-2">
              {initialData.template_html
                ? 'Template criado. Pode regenerá-lo a qualquer momento.'
                : 'Sem template. Crie um para usar na geração em lote.'}
            </p>
            <Link href={`/services/${initialData.id}/template`}>
              <button type="button" className="bib-btn bib-btn-secondary w-full py-2">
                {initialData.template_html ? 'Editar Template' : 'Criar Template'}
              </button>
            </Link>
          </div>
        </>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="bib-btn bib-btn-primary w-full py-2.5"
      >
        {loading ? 'A guardar...' : isEdit ? 'Guardar Alterações' : 'Criar Serviço'}
      </button>

      {/* MediaPickerModal */}
      {mediaModal?.open && (
        <MediaPickerModal
          isOpen
          onClose={() => setMediaModal(null)}
          mode={mediaModal.mode}
          source={isWhitelabel && mediaModal.mode === 'images' ? 'supabase' : 'wordpress'}
          siteId={effectiveSiteId}
          maxImages={mediaModal.target === 'featured' ? 1 : 8}
          onConfirmVideo={(url) => { setVideoUrl(url); setMediaModal(null); }}
          onConfirmImages={(urls) => {
            if (mediaModal.target !== 'featured') setImages(urls);
            setMediaModal(null);
          }}
          onConfirmImageItems={(items) => {
            if (mediaModal.target !== 'featured') return;
            const item = items[0];
            if (!item) return;
            setFeaturedImageAssetId(String(item.id));
            setFeaturedImageUrl(item.url);
            setFeaturedImageAlt(item.alt || item.title || name);
          }}
          initialVideoUrl={videoUrl}
          initialImages={
            mediaModal.target === 'featured'
              ? (featuredImageUrl ? [featuredImageUrl] : [])
              : images.filter(Boolean)
          }
        />
      )}
    </form>
  );
}
