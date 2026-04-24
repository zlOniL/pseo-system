'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Service, ServiceTemplate, GenerateTemplateInput, SectionLibrarySummary, RelatedService } from '@/lib/types';
import { PreviewPane, buildPreviewHtml } from '@/app/generate/_components/PreviewPane';

// ── tipos locais ──────────────────────────────────────────────────────────────

interface ActiveJob {
  id: string;
  label: string;
}

// ── GenerateForm ──────────────────────────────────────────────────────────────

interface GenerateFormProps {
  service: Service;
  template?: ServiceTemplate;
  onSubmit: (input: GenerateTemplateInput) => void;
  onCancel: () => void;
}

function GenerateForm({ service, template, onSubmit, onCancel }: GenerateFormProps) {
  const isRegen = !!template;
  const [isMainPage, setIsMainPage] = useState(template?.is_main_page ?? false);
  const [baseCity, setBaseCity] = useState(template?.base_city ?? service.template_base_city ?? 'Lisboa');
  const [serviceNotes, setServiceNotes] = useState(service.service_notes ?? '');
  const [feedback, setFeedback] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>(
    service.related_services?.length ? service.related_services : [{ name: '', url: '' }]
  );

  function addRelated() { setRelatedServices((p) => [...p, { name: '', url: '' }]); }
  function removeRelated(i: number) { setRelatedServices((p) => p.filter((_, idx) => idx !== i)); }
  function updateRelated(i: number, field: keyof RelatedService, value: string) {
    setRelatedServices((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  function handleSubmit() {
    const validRelated = relatedServices.filter((s) => s.name.trim() && s.url.trim());
    onSubmit({
      base_city: isMainPage ? undefined : (baseCity || 'Lisboa'),
      service_notes: serviceNotes.trim() || undefined,
      feedback: feedback.trim() || undefined,
      related_services: validRelated.length > 0 ? validRelated : undefined,
      is_main_page: isMainPage,
    });
  }

  return (
    <div className="space-y-5">
      {/* Toggle: página principal sem cidade */}
      <label className="flex items-start gap-3 cursor-pointer select-none rounded-lg border border-gray-200 px-3 py-2.5 hover:bg-gray-50 transition-colors">
        <input
          type="checkbox"
          checked={isMainPage}
          onChange={(e) => setIsMainPage(e.target.checked)}
          className="mt-0.5 accent-gray-900"
        />
        <div>
          <span className="text-sm font-medium text-gray-800">Página principal do serviço</span>
          <p className="text-xs text-gray-400 mt-0.5">Sem menção de cidade — não alimenta a biblioteca de secções nem a geração em massa.</p>
        </div>
      </label>

      {!isMainPage && (
        <div>
          <label className="bib-label">Cidade Base <span className="bib-label-hint">(substituída ao gerar para outras cidades)</span></label>
          <input className="bib-input" value={baseCity} onChange={(e) => setBaseCity(e.target.value)} placeholder="Lisboa" />
        </div>
      )}

      <div>
        <label className="bib-label">Contexto do Serviço <span className="bib-label-hint">(opcional — complementa o que está no cadastro)</span></label>
        <textarea className="bib-textarea" rows={3} value={serviceNotes} onChange={(e) => setServiceNotes(e.target.value)} placeholder="Tipos de trabalho, materiais, técnicas, marcas..." />
      </div>

      <div>
        <label className="bib-label">Serviços complementares <span className="bib-label-hint">(links no P10 — opcional)</span></label>
        <div className="space-y-2">
          {relatedServices.map((s, i) => (
            <div key={i} className="flex gap-1.5 items-center">
              <input className="bib-input flex-1" value={s.name} onChange={(e) => updateRelated(i, 'name', e.target.value)} placeholder="Nome" />
              <input className="bib-input flex-1" value={s.url} onChange={(e) => updateRelated(i, 'url', e.target.value)} placeholder="URL" />
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

      <div className="flex gap-2">
        <button type="button" onClick={handleSubmit} className="bib-btn bib-btn-primary flex-1 py-2.5">
          {isRegen ? 'Regenerar Template' : 'Gerar Template'}
        </button>
        <button type="button" onClick={onCancel} className="bib-btn bib-btn-secondary px-4">← Voltar</button>
      </div>
    </div>
  );
}

// ── TemplateCard ──────────────────────────────────────────────────────────────

interface TemplateCardProps {
  template: ServiceTemplate;
  service: Service;
  onRegenerate: (t: ServiceTemplate) => void;
  onDelete: (id: string) => void;
  onPreview: (t: ServiceTemplate) => void;
  onRename: (id: string, label: string) => void;
}

function TemplateCard({ template, onRegenerate, onDelete, onPreview, onRename }: TemplateCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(template.label ?? '');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const date = new Date(template.created_at).toLocaleDateString('pt-PT');

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  function startRename() {
    setMenuOpen(false);
    setLabelDraft(template.label ?? '');
    setEditingLabel(true);
    setTimeout(() => labelInputRef.current?.select(), 0);
  }

  function commitLabel() {
    setEditingLabel(false);
    onRename(template.id, labelDraft);
  }

  function cancelLabel() {
    setEditingLabel(false);
    setLabelDraft(template.label ?? '');
  }

  function handleMenuRegenerate() {
    setMenuOpen(false);
    onRegenerate(template);
  }

  function handleMenuDelete() {
    setMenuOpen(false);
    setConfirmDelete(true);
  }

  const displayName = template.label || `Template #${template.version}`;

  return (
    <div className="bib-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {template.is_main_page && (
              <span className="text-[10px] font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded px-1.5 py-0.5 leading-none shrink-0">
                Página Principal
              </span>
            )}
            {editingLabel ? (
              <input
                ref={labelInputRef}
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitLabel();
                  if (e.key === 'Escape') cancelLabel();
                }}
                maxLength={80}
                className="text-sm font-semibold text-gray-900 border-b border-gray-400 outline-none bg-transparent w-full"
                autoFocus
              />
            ) : (
              <span className="text-sm font-semibold text-gray-900 truncate">{displayName}</span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-0.5">
            {template.is_main_page
              ? `#${template.version} · Sem cidade · ${date}`
              : `#${template.version} · ${template.base_city} · ${date}`}
          </p>
        </div>

        {confirmDelete ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-500">Apagar?</span>
            <button onClick={() => onDelete(template.id)} className="text-xs text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50">Sim</button>
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-500 border border-gray-200 rounded px-2 py-0.5 hover:bg-gray-50">Não</button>
          </div>
        ) : (
          <div className="relative shrink-0" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="text-gray-400 hover:text-gray-700 transition-colors w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100 text-lg leading-none font-bold"
              title="Mais opções"
            >
              ···
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[130px]">
                <button
                  onClick={startRename}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 px-3 py-2 transition-colors"
                >
                  Renomear
                </button>
                <button
                  onClick={handleMenuRegenerate}
                  className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 px-3 py-2 transition-colors"
                >
                  Regenerar
                </button>
                <button
                  onClick={handleMenuDelete}
                  className="w-full text-left text-sm text-red-600 hover:bg-red-50 px-3 py-2 transition-colors"
                >
                  Apagar
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <button onClick={() => onPreview(template)} className="bib-btn bib-btn-secondary text-xs w-full">Pré-visualizar</button>
    </div>
  );
}

// ── QueueModal ────────────────────────────────────────────────────────────────

function QueueModal({ jobs, onClose }: { jobs: ActiveJob[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-[420px] max-w-[92vw] p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Fila de Geração</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors text-lg leading-none">✕</button>
        </div>

        <div className="divide-y divide-gray-100">
          {jobs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma geração em progresso.</p>
          ) : jobs.map((job, i) => (
            <div key={job.id} className="flex items-center gap-3 py-3">
              <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-800 truncate">{job.label}</p>
                <p className="text-xs text-gray-400">#{i + 1} na fila · a gerar...</p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-gray-400 border-t border-gray-100 pt-3">
          Podes navegar livremente — as gerações continuam em segundo plano.
        </p>
      </div>
    </div>
  );
}

// ── GeneratingBanner ──────────────────────────────────────────────────────────

function GeneratingBanner({ jobs, onOpenQueue }: { jobs: ActiveJob[]; onOpenQueue: () => void }) {
  if (jobs.length === 0) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
      <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin shrink-0" />
      {jobs.length === 1 ? (
        <span className="flex-1 truncate">A gerar: <strong>{jobs[0].label}</strong>...</span>
      ) : (
        <>
          <span className="flex-1"><strong>{jobs.length}</strong> gerações em progresso</span>
          <button
            onClick={onOpenQueue}
            className="shrink-0 text-amber-700 underline hover:no-underline font-medium"
          >
            Ver fila
          </button>
        </>
      )}
    </div>
  );
}

// ── TemplatePageClient ────────────────────────────────────────────────────────

interface Props {
  service: Service;
}

export default function TemplatePageClient({ service }: Props) {
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [templates, setTemplates] = useState<ServiceTemplate[]>([]);
  const [summary, setSummary] = useState<SectionLibrarySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ServiceTemplate | undefined>();
  const [previewTemplate, setPreviewTemplate] = useState<ServiceTemplate | null>(null);
  const [reextracting, setReextracting] = useState(false);
  const [activeJobs, setActiveJobs] = useState<ActiveJob[]>([]);
  const [showQueueModal, setShowQueueModal] = useState(false);

  async function reload() {
    const [tpls, sum] = await Promise.all([
      api.listTemplates(service.id),
      api.getLibrarySummary(service.id),
    ]);
    if (mountedRef.current) {
      setTemplates(tpls);
      setSummary(sum);
    }
  }

  useEffect(() => {
    reload().finally(() => { if (mountedRef.current) setLoading(false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStartGeneration(input: GenerateTemplateInput) {
    const targetTemplate = editingTemplate;
    const label = targetTemplate
      ? `Regeneração Template #${targetTemplate.version}`
      : `Novo template (${service.name})`;
    const jobId = crypto.randomUUID();

    setShowForm(false);
    setEditingTemplate(undefined);
    setActiveJobs((prev) => [...prev, { id: jobId, label }]);

    const promise = targetTemplate
      ? api.regenerateTemplate(service.id, targetTemplate.id, input)
      : api.createTemplate(service.id, input);

    promise
      .then((res) => {
        toast.success(`Template #${res.template.version} guardado com ${res.sections_saved} secções extraídas.`);
        if (mountedRef.current) {
          setPreviewTemplate(res.template);
          void reload();
        }
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        toast.error(`Erro ao gerar template: ${msg}`);
      })
      .finally(() => {
        if (mountedRef.current) {
          setActiveJobs((prev) => prev.filter((j) => j.id !== jobId));
        }
      });
  }

  async function handleDelete(templateId: string) {
    await api.deleteTemplate(service.id, templateId);
    if (previewTemplate?.id === templateId) setPreviewTemplate(null);
    toast.success('Template apagado.');
    void reload();
  }

  const handleRename = useCallback(async (templateId: string, label: string) => {
    try {
      const updated = await api.renameTemplate(service.id, templateId, label);
      setTemplates((prev) => prev.map((t) => (t.id === templateId ? updated : t)));
    } catch {
      toast.error('Erro ao renomear template.');
    }
  }, [service.id]);

  async function handleReextract() {
    setReextracting(true);
    try {
      const res = await api.reextractAllSections(service.id);
      toast.success(`Secções re-extraídas: ${res.templates_processed} template${res.templates_processed !== 1 ? 's' : ''} processado${res.templates_processed !== 1 ? 's' : ''}.`);
      void reload();
    } finally {
      if (mountedRef.current) setReextracting(false);
    }
  }

  const sectionsReady = summary.filter((s) => s.version_count >= 1).length;
  const totalSections = summary.length;
  const isGenerating = activeJobs.length > 0;

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Painel esquerdo ── */}
      {sidebarOpen && (
        <aside className="w-[380px] shrink-0 border-r border-gray-200 bg-white overflow-y-auto">

          <div className="sticky top-0 z-10 bg-white px-5 py-4 border-b border-gray-100 space-y-3">
            <div className="flex items-center gap-4">
              <Link href={`/services/${service.id}`} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                ← Voltar ao serviço
              </Link>
              <Link href="/contents" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                Ver Conteúdos
              </Link>
            </div>

            <GeneratingBanner jobs={activeJobs} onOpenQueue={() => setShowQueueModal(true)} />

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
                onSubmit={handleStartGeneration}
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
                    onRename={handleRename}
                  />
                ))}

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
              <span className="bg-gray-100 rounded px-2 py-0.5">
                {previewTemplate.is_main_page
                  ? `Template #${previewTemplate.version} · Página Principal`
                  : `Template #${previewTemplate.version} · ${previewTemplate.base_city}`}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(buildPreviewHtml(previewTemplate.html, previewTemplate.video_url ?? undefined, 'ai'))
                    .then(() => toast.success('HTML copiado para a área de transferência.'))
                    .catch(() => toast.error('Não foi possível copiar o HTML.'));
                }}
                className="ml-auto text-xs text-gray-500 hover:text-gray-900 border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50 transition-colors"
              >
                Copiar HTML
              </button>
              <button onClick={() => setPreviewTemplate(null)} className="text-gray-400 hover:text-gray-700">✕</button>
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
            {isGenerating ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <div className="w-5 h-5 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span>
                  {activeJobs.length === 1
                    ? 'A gerar template... podes navegar enquanto esperas.'
                    : `${activeJobs.length} templates a gerar... podes navegar enquanto esperas.`}
                </span>
                {activeJobs.length > 1 && (
                  <button
                    onClick={() => setShowQueueModal(true)}
                    className="text-xs text-amber-600 underline hover:no-underline"
                  >
                    Ver fila de geração
                  </button>
                )}
              </div>
            ) : (
              <span>Clica em &quot;Pré-visualizar&quot; num template para ver o conteúdo aqui.</span>
            )}
          </div>
        )}
      </main>

      {/* ── Modal de fila ── */}
      {showQueueModal && (
        <QueueModal jobs={activeJobs} onClose={() => setShowQueueModal(false)} />
      )}
    </div>
  );
}
