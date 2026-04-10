'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Service, CreateServiceInput, RelatedService } from '@/lib/types';
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

  const [mediaModal, setMediaModal] = useState<{ open: boolean; mode: 'video' | 'images' } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      video_url: videoUrl || undefined,
      images,
      related_services: relatedServices.filter((r) => r.name && r.url),
      service_notes: serviceNotes || undefined,
      tone: tone || undefined,
      min_words: minWords,
    };

    try {
      if (isEdit && initialData) {
        await api.updateService(initialData.id, input);
        router.refresh();
      } else {
        const service = await api.createService(input);
        router.push(`/services/${service.id}`);
      }
    } catch (err) {
      setError((err as Error).message);
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
