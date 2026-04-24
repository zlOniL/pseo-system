'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Service, ServiceTemplate, GenerateTemplateInput, SectionLibrarySummary, RelatedService } from '@/lib/types';
import { PreviewPane } from '@/app/generate/_components/PreviewPane';

interface GenerateFormProps {
  service: Service;
  template?: ServiceTemplate;
  onSuccess: (template: ServiceTemplate, sectionsSaved: number) => void;
  onCancel: () => void;
}

function GenerateForm({ service, template, onSuccess, onCancel }: GenerateFormProps) {
  const isRegen = !!template;
  const [baseCity, setBaseCity] = useState(template?.base_city ?? service.template_base_city ?? 'Lisboa');
  const [serviceNotes, setServiceNotes] = useState(service.service_notes ?? '');
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>(
    service.related_services?.length ? service.related_services : [{ name: '', url: '' }]
  );

  function addRelated() { setRelatedServices((p) => [...p, { name: '', url: '' }]); }
  function removeRelated(i: number) { setRelatedServices((p) => p.filter((_, idx) => idx !== i)); }
  function updateRelated(i: number, field: keyof RelatedService, value: string) {
    setRelatedServices((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    const validRelated = relatedServices.filter((s) => s.name.trim() && s.url.trim());
    const input: GenerateTemplateInput = {
      base_city: baseCity || 'Lisboa',
      service_notes: serviceNotes.trim() || undefined,
      feedback: feedback.trim() || undefined,
      related_services: validRelated.length > 0 ? validRelated : undefined,
    };
    try {
      const res = isRegen
        ? await api.regenerateTemplate(service.id, template!.id, input)
        : await api.createTemplate(service.id, input);
      onSuccess(res.template, res.sections_saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="bib-label">Cidade Base <span className="bib-label-hint">(substituída ao gerar para outras cidades)</span></label>
        <input className="bib-input" value={baseCity} onChange={(e) => setBaseCity(e.target.value)} placeholder="Lisboa" />
      </div>

      <div>
        <label className="bib-label">Contexto do Serviço <span className="bib-label-hint">(opcional — complementa o que está no cadastro)</span></label>
        <textarea className="bib-textarea" rows={3} value={serviceNotes} onChange={(e) => setServiceNotes(e.target.value)} placeholder="Tipos de trabalho, materiais, técnicas, marcas..." />
      </div>

      {/* Serviços complementares */}
      <div>
        <label className="bib-label">Serviços complementares <span className="bib-label-hint">(links no P10 — opcional)</span></label>
        <div className="space-y-2">
          {relatedServices.map((s, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input
                className="bib-input flex-1"
                value={s.name}
                onChange={(e) => updateRelated(i, 'name', e.target.value)}
                placeholder="Nome"
              />
              <input
                className="bib-input flex-1"
                value={s.url}
                onChange={(e) => updateRelated(i, 'url', e.target.value)}
                placeholder="URL"
              />
              <button type="button" onClick={() => removeRelated(i)} className="text-gray-300 hover:text-red-400 transition-colors px-1 shrink-0">✕</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addRelated} className="mt-1.5 text-xs text-gray-500 hover:text-gray-800 transition-colors">
          + Adicionar serviço
        </button>
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-xs text-gray-500">
        Imagens e vídeo são sempre carregados do cadastro do serviço.
      </div>

      {isRegen && (
        <div>
          <button type="button" onClick={() => setShowFeedback((v) => !v)} className="bib-btn bib-btn-ghost text-xs w-full">
            {showFeedback ? '— Ocultar feedback' : '+ Adicionar feedback para regeneração'}
          </button>
          {showFeedback && (
            <textarea className="bib-textarea mt-2" rows={3} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Descreva o que deve ser melhorado..." />
          )}
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">{error}</div>}

      <div className="flex gap-2">
        <button type="button" disabled={loading} onClick={handleSubmit} className="bib-btn bib-btn-primary flex-1 py-2.5">
          {loading ? 'A gerar... (30–60s)' : isRegen ? 'Regenerar Template' : 'Gerar Template'}
        </button>
        <button type="button" onClick={onCancel} className="bib-btn bib-btn-secondary px-4">Cancelar</button>
      </div>
    </div>
  );
}

interface TemplateCardProps {
  template: ServiceTemplate;
  service: Service;
  onRegenerate: (t: ServiceTemplate) => void;
  onDelete: (id: string) => void;
  onPreview: (t: ServiceTemplate) => void;
}

function TemplateCard({ template, onRegenerate, onDelete, onPreview }: TemplateCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const date = new Date(template.created_at).toLocaleDateString('pt-PT');

  return (
    <div className="bib-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-gray-900">Template #{template.version}</p>
          <p className="text-xs text-gray-500 mt-0.5">Cidade base: <strong>{template.base_city}</strong> · {date}</p>
        </div>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 text-sm shrink-0">🗑</button>
        ) : (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-500">Apagar?</span>
            <button onClick={() => onDelete(template.id)} className="text-xs text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50">Sim</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50">Não</button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <button onClick={() => onPreview(template)} className="bib-btn bib-btn-secondary text-xs flex-1">
          Pré-visualizar
        </button>
        <button onClick={() => onRegenerate(template)} className="bib-btn bib-btn-ghost text-xs flex-1">
          Regenerar
        </button>
      </div>
    </div>
  );
}

interface Props {
  service: Service;
}

export default function TemplatePageClient({ service }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [summary, setSummary] = useState<SectionLibrarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | undefined>();
  const [previewTemplate, setPreviewTemplate] = useState<ServiceTemplate | null>(null);
  const [reextracting, setReextracting] = useState(false);

  async function reload() {
    const [tpls, sum] = await Promise.all([
      api.listTemplates(service.id),
      api.getLibrarySummary(service.id),
    ]);
    setTemplates(tpls);
    setSummary(sum);
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSuccess(template: ServiceTemplate, sectionsSaved: number) {
    setShowForm(false);
    setEditingTemplate(undefined);
    setPreviewTemplate(template);
    toast.success(`Template #${template.version} guardado com ${sectionsSaved} secções extraídas.`);
    void reload();
  }

  async function handleDelete(templateId: string) {
    await api.deleteTemplate(service.id, templateId);
    if (previewTemplate?.id === templateId) setPreviewTemplate(null);
    toast.success("Template apagado.");
    void reload();
  }

  async function handleReextract() {
    setReextracting(true);
    try {
      const res = await api.reextractAllSections(service.id);
      toast.success(`Secções re-extraídas: ${res.templates_processed} template${res.templates_processed !== 1 ? 's' : ''} processado${res.templates_processed !== 1 ? 's' : ''}.`);
      void reload();
    } finally {
      setReextracting(false);
    }
  }

  const sectionsReady = summary.filter((s) => s.version_count >= 1).length;
  const totalSections = summary.length;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Painel esquerdo ── */}
      {sidebarOpen && (
      <aside className="w-[380px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">

        <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-gray-100">
          <Link href={`/services/${service.id}`} className="text-xs text-gray-400 hover:text-gray-600 mb-1.5 inline-block">
            ← Voltar ao serviço
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-gray-900">Templates · {service.name}</h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {templates.length} template{templates.length !== 1 ? 's' : ''} ·{' '}
                <span className={sectionsReady === totalSections ? 'text-emerald-600' : 'text-amber-600'}>
                  {sectionsReady}/{totalSections} secções na biblioteca
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {!showForm && !editingTemplate && (
                <button onClick={() => setShowForm(true)} className="bib-btn bib-btn-primary text-xs px-3 py-1.5">
                  + Novo
                </button>
              )}
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
                title="Ocultar painel"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-5 space-y-4 pb-10">
          {(showForm || editingTemplate) ? (
            <GenerateForm
              service={service}
              template={editingTemplate}
              onSuccess={handleSuccess}
              onCancel={() => { setShowForm(false); setEditingTemplate(undefined); }}
            />
          ) : loading ? (
            <p className="text-xs text-gray-400 text-center py-8">A carregar...</p>
          ) : templates.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p className="text-sm text-gray-500">Ainda não há templates.</p>
              <p className="text-xs text-gray-400">Cria o primeiro para começar a biblioteca de secções.</p>
              <button onClick={() => setShowForm(true)} className="bib-btn bib-btn-primary text-xs px-4 py-2">
                + Gerar primeiro template
              </button>
            </div>
          ) : (
            <>
              {templates.map((t) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  service={service}
                  onRegenerate={(tpl) => { setEditingTemplate(tpl); setShowForm(false); }}
                  onDelete={handleDelete}
                  onPreview={setPreviewTemplate}
                />
              ))}

              {/* Resumo da biblioteca */}
              {summary.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600">Biblioteca de Secções</p>
                    <button
                      onClick={handleReextract}
                      disabled={reextracting || templates.length === 0}
                      className="text-xs text-gray-400 hover:text-gray-700 underline disabled:opacity-40"
                      title="Re-extrai todas as secções dos templates guardados (útil após correcção de bugs)"
                    >
                      {reextracting ? 'A re-extrair...' : 'Re-extrair secções'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {summary.map((s) => (
                      <div
                        key={s.section_key}
                        className={`text-xs px-2 py-1 rounded flex items-center justify-between ${
                          s.version_count === 0
                            ? 'bg-red-50 text-red-600'
                            : s.version_count < 3
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        <span className="truncate">{s.section_key.replace(/_/g, ' ')}</span>
                        <span className="font-medium ml-1 shrink-0">{s.version_count}v</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </aside>
      )}

      {/* ── Painel direito: preview ── */}
      <main className="flex-1 overflow-y-auto">
        {previewTemplate ? (
          <>
            <div className="sticky top-0 z-10 px-4 py-2.5 border-b border-gray-200 bg-white flex items-center gap-3 text-xs text-gray-500">
              {!sidebarOpen && (
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50 shrink-0"
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Mostrar painel
                </button>
              )}
              <span className="font-medium text-gray-700">Preview</span>
              <span className="bg-gray-100 rounded px-2 py-0.5">Template #{previewTemplate.version} · {previewTemplate.base_city}</span>
              <button onClick={() => setPreviewTemplate(null)} className="ml-auto text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4">
              <PreviewPane html={previewTemplate.html} videoUrl={previewTemplate.video_url ?? undefined} loading={false} generationMode="ai" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-sm text-gray-400">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Mostrar painel
              </button>
            )}
            Clica em &quot;Pré-visualizar&quot; num template para ver o conteúdo aqui.
          </div>
        )}
      </main>
    </div>
  );
}
