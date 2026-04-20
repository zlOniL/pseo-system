'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Service, Content } from '@/lib/types';
import { PreviewPane } from '@/app/generate/_components/PreviewPane';
import { ScoreCard } from '@/app/generate/_components/ScoreCard';
import MediaPickerModal from '@/app/_components/MediaPickerModal';

const IMAGE_LABELS = [
  'Imagem 1 — antes de Procura em Buscadores',
  'Imagem 2 — antes de Principais Problemas',
  'Imagem 3 — antes de Serviços (subcategorias)',
  'Imagem 4 — antes de Como Funciona / Tipos',
  'Imagem 5 — antes de Prevenção e Manutenção',
  'Imagem 6 — antes de contexto local / cidade',
  'Imagem 7 — dentro de Sistemas e Intervenções',
  'Imagem 8 — antes de Perguntas Frequentes',
];

function normaliseImages(raw: string[]): string[] {
  const slots = Array(8).fill('');
  raw.forEach((url, i) => { if (i < 8) slots[i] = url ?? ''; });
  return slots;
}

interface Props {
  service: Service;
}

export default function TemplatePageClient({ service }: Props) {
  const [baseCity, setBaseCity] = useState(service.template_base_city ?? 'Lisboa');
  const [videoUrl, setVideoUrl] = useState(service.video_url ?? '');
  const [images, setImages] = useState<string[]>(normaliseImages(service.images ?? []));
  const [serviceNotes, setServiceNotes] = useState(service.service_notes ?? '');
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [mediaModal, setMediaModal] = useState<{ open: boolean; mode: 'video' | 'images' } | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Content | null>(null);

  const previewHtml = result?.html ?? service.template_html ?? null;
  const previewVideo = result?.video_url ?? videoUrl;
  const hasExistingTemplate = !!service.template_html;

  function updateImage(i: number, val: string) {
    setImages((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  }

  async function handleGenerate() {
    setLoading(true);
    setError(null);

    const hasAnyImage = images.some((u) => u.trim());

    try {
      const res = await api.generateTemplate(service.id, {
        base_city: baseCity || 'Lisboa',
        images: hasAnyImage ? images : undefined,
        video_url: videoUrl.trim() || undefined,
        service_notes: serviceNotes.trim() || undefined,
        feedback: feedback.trim() || undefined,
      });
      setResult(res.content);
      setFeedback('');
      setShowFeedback(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Painel esquerdo (scroll independente) ── */}
      <aside className="w-[420px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">

        {/* Header sticky */}
        <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-gray-100">
          <Link
            href={`/services/${service.id}`}
            className="text-xs text-gray-400 hover:text-gray-600 mb-1.5 inline-block"
          >
            ← Voltar ao serviço
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Template · {service.name}</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Base HTML usada em geração em lote. A cidade base é substituída automaticamente.
          </p>
        </div>

        {/* Form */}
        <div className="px-5 py-5 space-y-5 pb-10">

          {/* Estado do template existente */}
          {hasExistingTemplate && !result && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-800">
              Template existente para <strong>{service.template_base_city ?? 'Lisboa'}</strong>. Pode regenerá-lo abaixo.
            </div>
          )}

          {/* Score após geração */}
          {result && <ScoreCard content={result} />}

          {/* Serviço (read-only) */}
          <div>
            <label className="bib-label">Serviço</label>
            <input className="bib-input bg-gray-50 text-gray-500" value={service.name} readOnly />
          </div>

          {/* Cidade base */}
          <div>
            <label className="bib-label">
              Cidade Base <span className="bib-label-hint">(substituída ao gerar para outras cidades)</span>
            </label>
            <input
              className="bib-input"
              value={baseCity}
              onChange={(e) => setBaseCity(e.target.value)}
              placeholder="Lisboa"
            />
          </div>

          {/* Contexto / Notas */}
          <div>
            <label className="bib-label">
              Contexto do Serviço <span className="bib-label-hint">(opcional — enriquece a IA)</span>
            </label>
            <textarea
              className="bib-textarea"
              rows={4}
              value={serviceNotes}
              onChange={(e) => setServiceNotes(e.target.value)}
              placeholder="Tipos de trabalho, materiais, técnicas, marcas, diferenciais, público-alvo..."
            />
            <p className="mt-1 text-xs text-gray-400">
              Quanto mais contexto, melhor a qualidade técnica do template.
            </p>
          </div>

          <div className="bib-divider" />

          {/* Vídeo */}
          <div>
            <label className="bib-label">
              URL do Vídeo <span className="bib-label-hint">(MP4 do WordPress)</span>
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

          {/* Imagens — inputs posicionais */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="bib-label" style={{ marginBottom: 0 }}>
                Imagens <span className="bib-label-hint">({images.filter(Boolean).length}/8 preenchidas)</span>
              </label>
              <button
                type="button"
                onClick={() => setMediaModal({ open: true, mode: 'images' })}
                className="bib-btn bib-btn-ghost text-xs"
              >
                Biblioteca WP
              </button>
            </div>
            <div className="space-y-1.5">
              {images.map((url, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 w-4 shrink-0 font-medium">{i + 1}</span>
                  <input
                    className="bib-input text-xs"
                    value={url}
                    onChange={(e) => updateImage(i, e.target.value)}
                    placeholder={IMAGE_LABELS[i]}
                  />
                  {url && (
                    <button
                      type="button"
                      onClick={() => updateImage(i, '')}
                      className="text-gray-300 hover:text-red-400 shrink-0 text-sm leading-none"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-400">
              Campos em branco são ignorados. Use a Biblioteca WP para preencher em lote.
            </p>
          </div>

          <div className="bib-divider" />

          {/* Feedback para regeneração */}
          {(result || hasExistingTemplate) && (
            <div>
              <button
                type="button"
                onClick={() => setShowFeedback((v) => !v)}
                className="bib-btn bib-btn-ghost text-xs w-full"
              >
                {showFeedback ? '— Ocultar feedback' : '+ Adicionar feedback para regeneração'}
              </button>
              {showFeedback && (
                <textarea
                  className="bib-textarea mt-2"
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="Descreva o que deve ser melhorado ou alterado..."
                />
              )}
            </div>
          )}

          {/* Erro */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              {error}
            </div>
          )}

          {/* Botão gerar */}
          <button
            type="button"
            disabled={loading}
            onClick={handleGenerate}
            className="bib-btn bib-btn-primary w-full py-2.5"
          >
            {loading
              ? 'A gerar... (pode demorar 30–60s)'
              : result || hasExistingTemplate
              ? 'Regenerar Template'
              : 'Gerar Template'}
          </button>

        </div>
      </aside>

      {/* ── Painel direito: preview ── */}
      <main className="flex-1 overflow-y-auto">
        {previewHtml && !loading && (
          <div className="sticky top-0 z-10 px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-3 text-xs text-gray-500">
            <span className="font-medium text-gray-700">Preview</span>
            <span className="bg-gray-100 rounded px-2 py-0.5">
              Cidade base: {result ? (baseCity || 'Lisboa') : (service.template_base_city ?? 'Lisboa')}
            </span>
            {result && (
              <span className="text-emerald-600 font-medium">Template guardado</span>
            )}
          </div>
        )}
        <div className="p-4">
          <PreviewPane
            html={previewHtml}
            videoUrl={previewVideo || undefined}
            loading={loading}
            generationMode="ai"
          />
        </div>
      </main>

      {/* MediaPickerModal */}
      {mediaModal?.open && (
        <MediaPickerModal
          isOpen
          onClose={() => setMediaModal(null)}
          mode={mediaModal.mode}
          onConfirmVideo={(url) => { setVideoUrl(url); setMediaModal(null); }}
          onConfirmImages={(urls) => {
            setImages(normaliseImages(urls));
            setMediaModal(null);
          }}
          initialVideoUrl={videoUrl}
          initialImages={images.filter(Boolean)}
        />
      )}
    </div>
  );
}
