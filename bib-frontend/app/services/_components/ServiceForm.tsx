'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Service, CreateServiceInput, RelatedService, WpCategory } from '@/lib/types';
import MediaPickerModal from '@/app/_components/MediaPickerModal';

interface ServiceFormProps {
  initialData?: Service;
}

export default function ServiceForm({ initialData }: ServiceFormProps) {
  const router = useRouter();
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? '');
  const [videoUrl, setVideoUrl] = useState(initialData?.video_url ?? '');
  const [images, setImages] = useState<string[]>(initialData?.images ?? []);
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>(
    initialData?.related_services ?? [],
  );
  const [serviceNotes, setServiceNotes] = useState(initialData?.service_notes ?? '');
  const [tone, setTone] = useState(initialData?.tone ?? '');
  const [minWords, setMinWords] = useState(initialData?.min_words ?? 5000);
  const [wordpressCategory, setWordpressCategory] = useState(initialData?.wordpress_category ?? '');
  const [seoTitle, setSeoTitle] = useState(initialData?.seo_title ?? '');
  const [seoDescription, setSeoDescription] = useState(initialData?.seo_description ?? '');
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [wpCatLoading, setWpCatLoading] = useState(false);
  const [wpCatError, setWpCatError] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategory, setShowNewCategory] = useState(false);

  const [mediaModal, setMediaModal] = useState<{ open: boolean; mode: 'video' | 'images' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setWpCatLoading(true);
    api.getWpCategories()
      .then(setWpCategories)
      .catch((err: Error) => setWpCatError(err.message))
      .finally(() => setWpCatLoading(false));
  }, []);

  function addRelated() {
    setRelatedServices((prev) => [...prev, { name: '', url: '' }]);
  }
  function removeRelated(i: number) {
    setRelatedServices((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updateRelated(i: number, field: 'name' | 'url', value: string) {
    setRelatedServices((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError('O nome é obrigatório.'); return; }
    setLoading(true);
    setError('');

    const input: CreateServiceInput = {
      name: name.trim(),
      video_url: videoUrl || null,
      images,
      related_services: relatedServices.filter((r) => r.name && r.url),
      service_notes: serviceNotes || null,
      tone: tone,
      min_words: minWords,
      wordpress_category: wordpressCategory || null,
      seo_title: seoTitle.trim() || null,
      seo_description: seoDescription.trim() || null,
    };

    try {
      if (isEdit && initialData) {
        await api.updateService(initialData.id, input);
        toast.success("Serviço guardado com sucesso!");
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
            onClick={() => setMediaModal({ open: true, mode: 'video' })}
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
          onClick={() => setMediaModal({ open: true, mode: 'images' })}
          className="w-full text-sm border border-dashed border-gray-300 rounded-lg px-3 py-3 text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors text-center"
        >
          {images.filter(Boolean).length > 0
            ? `${images.filter(Boolean).length} imagem(ns) selecionada(s) — clique para alterar`
            : 'Escolher Imagens da Biblioteca WordPress'}
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
        <div className="space-y-2">
          {relatedServices.map((r, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                className="bib-input"
                value={r.name}
                onChange={(e) => updateRelated(i, 'name', e.target.value)}
                placeholder="Nome"
              />
              <input
                className="bib-input"
                value={r.url}
                onChange={(e) => updateRelated(i, 'url', e.target.value)}
                placeholder="URL"
              />
              <button
                type="button"
                onClick={() => removeRelated(i)}
                className="bib-btn bib-btn-ghost text-gray-400 hover:text-red-500 shrink-0"
              >
                ✕
              </button>
            </div>
          ))}
          {relatedServices.length === 0 && (
            <p className="text-xs text-gray-400">Nenhum serviço adicionado.</p>
          )}
        </div>
      </div>

      <div className="bib-divider" />

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
          onConfirmVideo={(url) => { setVideoUrl(url); setMediaModal(null); }}
          onConfirmImages={(urls) => { setImages(urls); setMediaModal(null); }}
          initialVideoUrl={videoUrl}
          initialImages={images.filter(Boolean)}
        />
      )}
    </form>
  );
}
