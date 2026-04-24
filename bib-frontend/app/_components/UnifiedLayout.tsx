"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Content, RelatedService, WpCategory } from "@/lib/types";
import { ScoreCard } from "@/app/generate/_components/ScoreCard";
import { PreviewPane } from "@/app/generate/_components/PreviewPane";
import MediaPickerModal from "@/app/_components/MediaPickerModal";

// ── helpers ──────────────────────────────────────────────────────────────────

const IMAGE_HINTS = [
  "Antes de Procura em Buscadores",
  "Antes de Principais Problemas",
  "Antes de Serviços (subcategorias)",
  "Antes de Como Funciona / Tipos",
  "Antes de Prevenção e Manutenção",
  "Antes de contexto local / cidade",
  "Dentro de Sistemas e Intervenções",
  "Antes de Perguntas Frequentes",
];

function initImages(stored: string[] | null): string[] {
  const base = stored ?? [];
  return Array.from({ length: 8 }, (_, i) => base[i] ?? "");
}

function initRelated(stored: RelatedService[] | null): RelatedService[] {
  return stored && stored.length > 0 ? stored : [{ name: "", url: "" }];
}

// ── status labels ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  approved: "Aprovado",
  published: "Publicado",
};

const STATUS_DOT: Record<string, string> = {
  draft: "bg-gray-300",
  approved: "bg-amber-400",
  published: "bg-emerald-500",
};

// ── sub-components ────────────────────────────────────────────────────────────

function Divider() {
  return <div className="border-t border-gray-100" />;
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 mb-1.5">{children}</label>;
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 ${props.className ?? ""}`}
    />
  );
}

// ── main component ────────────────────────────────────────────────────────────

interface Props {
  initialContent?: Content;
}

export function UnifiedLayout({ initialContent }: Props) {
  const router = useRouter();
  const isEditing = !!initialContent;

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [content, setContent] = useState<Content | null>(initialContent ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);

  // Form fields (pre-populated from initialContent)
  const [service, setService] = useState(initialContent?.service ?? "");
  const [city, setCity] = useState(initialContent?.city ?? "");
  const [keyword, setKeyword] = useState(
    // If keyword differs from "service em city", show it explicitly
    initialContent
      ? initialContent.main_keyword !== `${initialContent.service} em ${initialContent.city}`
        ? initialContent.main_keyword
        : ""
      : ""
  );
  const [videoUrl, setVideoUrl] = useState(initialContent?.video_url ?? "");
  const [images, setImages] = useState(() => initImages(initialContent?.images ?? null));
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>(() =>
    initRelated(initialContent?.related_services ?? null)
  );
  const [wpCategory, setWpCategory] = useState(initialContent?.wordpress_category ?? "");
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);
  const [localityNotes, setLocalityNotes] = useState("");
  const [serviceNotes, setServiceNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [mediaModal, setMediaModal] = useState<{ open: boolean; mode: "video" | "images" } | null>(null);

  const autoKeyword = service ? (city ? `${service} em ${city}` : service) : "";

  useEffect(() => {
    api.getWpCategories().then(setWpCategories).catch(() => {});
  }, []);
  const effectiveKeyword = keyword || autoKeyword;

  // ── form helpers ────────────────────────────────────────────────────────────

  function updateImage(i: number, value: string) {
    setImages((p) => p.map((v, idx) => (idx === i ? value : v)));
  }
  function addRelated() {
    setRelatedServices((p) => [...p, { name: "", url: "" }]);
  }
  function removeRelated(i: number) {
    setRelatedServices((p) => p.filter((_, idx) => idx !== i));
  }
  function updateRelated(i: number, field: keyof RelatedService, value: string) {
    setRelatedServices((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }

  function buildGeneratePayload() {
    const validRelated = relatedServices.filter((s) => s.name.trim() && s.url.trim());
    const hasAnyImage = images.some((u) => u.trim());
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
    };
  }

  // ── actions ─────────────────────────────────────────────────────────────────

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.generate(buildGeneratePayload());
      setContent(result);
      router.replace(`/contents/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao gerar");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegenerate(e: React.FormEvent) {
    e.preventDefault();
    if (!content) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.regenerate({
        content_id: content.id,
        ...buildGeneratePayload(),
        feedback: feedback || undefined,
      });
      setContent(result);
      setShowRegenerate(false);
      setFeedback("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao regenerar");
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove() {
    if (!content) return;
    setActionLoading(true);
    setError(null);
    try {
      const result = await api.approveContent(content.id);
      setContent(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete() {
    if (!content) return;
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setActionLoading(true);
    try {
      await api.deleteContent(content.id);
      router.push("/contents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao apagar");
      setActionLoading(false);
      setConfirmDelete(false);
    }
  }

  const isPublished = content?.status === "published";

  // ── render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── SIDEBAR ──────────────────────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-[400px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">

          {/* Header */}
          <div className="shrink-0 px-5 h-12 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {content && (
                <span className={`w-2 h-2 rounded-full ${STATUS_DOT[content.status]}`} />
              )}
              <span className="text-sm font-semibold text-gray-900">
                {content ? content.main_keyword : "Nova página SEO"}
              </span>
            </div>
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

          {/* Score + Actions (apenas se existe conteúdo) */}
          {content && (
            <div className="shrink-0 px-5 py-4 border-b border-gray-100 space-y-3">
              <ScoreCard content={content} />

              {/* Status + ações principais */}
              <div className="flex flex-wrap gap-2">
                {content.status === "draft" && (
                  <button
                    onClick={handleApprove}
                    disabled={actionLoading}
                    className="flex-1 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    Aprovar
                  </button>
                )}
                {content.status === "approved" && (
                  <button
                    onClick={handlePublish}
                    disabled={actionLoading}
                    className="flex-1 bg-gray-900 text-white rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    Publicar no WordPress
                  </button>
                )}
                {content.status === "published" && content.wp_post_url && (
                  <a
                    href={content.wp_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 text-center bg-white text-emerald-700 border border-emerald-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-emerald-50 transition-colors"
                  >
                    Ver no WordPress ↗
                  </a>
                )}
                <button
                  onClick={() => setShowRegenerate((v) => !v)}
                  className="bg-white text-gray-700 border border-gray-200 rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-50 transition-colors"
                >
                  {showRegenerate ? "Fechar" : "Regenerar"}
                </button>
              </div>

              {/* Feedback + Regenerar */}
              {showRegenerate && (
                <form onSubmit={handleRegenerate} className="space-y-2">
                  <textarea
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Feedback opcional (ex: mais contexto sobre Lisboa...)"
                    rows={2}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 resize-none"
                  />
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-xs font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
                  >
                    {loading ? "A regenerar..." : "Regenerar com alterações do formulário"}
                  </button>
                </form>
              )}

              {/* Delete */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-medium ${STATUS_DOT[content.status] ? "" : ""}`}>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${STATUS_DOT[content.status]}`} />
                  <span className="text-gray-500">{STATUS_LABEL[content.status] ?? content.status}</span>
                </span>
                {isPublished ? (
                  <span className="text-xs text-gray-400">Publicada — não apagável</span>
                ) : confirmDelete ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleDelete}
                      disabled={actionLoading}
                      className="text-xs text-red-600 border border-red-200 rounded-md px-2.5 py-1 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {actionLoading ? "..." : "Confirmar"}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      className="text-xs text-gray-500 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleDelete}
                    className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-md px-2.5 py-1 hover:border-red-200 hover:bg-red-50 transition-colors"
                  >
                    Apagar
                  </button>
                )}
              </div>

              {error && <p className="text-red-600 text-xs">{error}</p>}
            </div>
          )}

          {/* Form */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <form
              onSubmit={isEditing || content ? (e) => e.preventDefault() : handleGenerate}
              className="space-y-4"
            >
              {/* Serviço + Cidade + Keyword */}
              <div className="space-y-3">
                <div>
                  <Label>Serviço *</Label>
                  <Input required value={service} onChange={(e) => setService(e.target.value)} placeholder="ex: Reparação de Janelas" />
                </div>
                <div>
                  <Label>Cidade <span className="text-gray-400 font-normal">(opcional)</span></Label>
                  <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="ex: Lisboa" />
                </div>
                <div>
                  <Label>
                    Palavra-chave{" "}
                    <span className="text-gray-400 font-normal">(auto: &quot;{autoKeyword || "Serviço"}&quot;)</span>
                  </Label>
                  <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder={autoKeyword || "Deixar em branco para auto"} />
                </div>
              </div>

              {/* Categoria WordPress */}
              <div>
                <Label>Categoria WordPress <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <select
                  value={wpCategory}
                  onChange={(e) => setWpCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400"
                >
                  <option value="">Apenas Blog (padrão)</option>
                  {wpCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              <Divider />

              {/* Vídeo */}
              <div>
                <Label>URL do Vídeo <span className="text-gray-400 font-normal">(MP4 — topo da página)</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://site.pt/wp-content/.../video.mp4"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setMediaModal({ open: true, mode: "video" })}
                    className="shrink-0 text-xs border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors text-gray-600"
                  >
                    Escolher
                  </button>
                </div>
              </div>

              {/* Imagens */}
              <div>
                <Label>
                  Imagens <span className="text-gray-400 font-normal">({images.filter(Boolean).length}/8 selecionadas)</span>
                </Label>
                <button
                  type="button"
                  onClick={() => setMediaModal({ open: true, mode: "images" })}
                  className="w-full text-sm border border-dashed border-gray-300 rounded-lg px-3 py-3 text-gray-500 hover:bg-gray-50 hover:border-gray-400 transition-colors text-center"
                >
                  {images.filter(Boolean).length > 0
                    ? `${images.filter(Boolean).length} imagem(ns) — clique para alterar`
                    : "Escolher Imagens da Biblioteca WordPress"}
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
                <p className="mt-1.5 text-xs text-gray-400">Posições preservadas conforme ordem de seleção.</p>
              </div>

              <Divider />

              {/* Enriquecimento local */}
              <div>
                <Label>Contexto da localidade <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <textarea
                  value={localityNotes}
                  onChange={(e) => setLocalityNotes(e.target.value)}
                  placeholder="ex: Cidade histórica, famosa pelo Castelo e pela Sé. Principais ruas: Rua Direita, Avenida 5 de Outubro. Bairros: Mouraria, Alfama."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">Ruas, monumentos, bairros e pontos turísticos reais — a IA distribuirá estas referências ao longo do texto.</p>
              </div>

              {/* Enriquecimento de serviço */}
              <div>
                <Label>Contexto do serviço / ferramentas <span className="text-gray-400 font-normal">(opcional)</span></Label>
                <textarea
                  value={serviceNotes}
                  onChange={(e) => setServiceNotes(e.target.value)}
                  placeholder="ex: Usar ferramentas Rothenberger e RIDGID. Mencionar câmaras de inspeção endoscópica e desentupidoras de alta pressão. Norma NP EN 12056."
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 bg-white focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 resize-none"
                />
                <p className="mt-1 text-xs text-gray-400">Ferramentas, marcas e técnicas específicas — a IA integrará estas referências nas secções técnicas.</p>
              </div>

              <Divider />

              {/* Serviços relacionados */}
              <div>
                <Label>Serviços complementares <span className="text-gray-400 font-normal">(links internos)</span></Label>
                <div className="space-y-2">
                  {relatedServices.map((s, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input value={s.name} onChange={(e) => updateRelated(i, "name", e.target.value)} placeholder="Nome" />
                      <Input value={s.url} onChange={(e) => updateRelated(i, "url", e.target.value)} placeholder="URL" />
                      <button type="button" onClick={() => removeRelated(i)} className="text-gray-300 hover:text-red-400 transition-colors px-1 shrink-0">✕</button>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={addRelated} className="mt-2 text-xs text-gray-500 hover:text-gray-800 transition-colors">
                  + Adicionar serviço
                </button>
              </div>

              {/* Error (nova geração) */}
              {!content && error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">{error}</div>
              )}

              {/* Botão Gerar (só quando ainda não existe conteúdo) */}
              {!content && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? "A gerar... (30–60s)" : "Gerar Página"}
                </button>
              )}
            </form>
          </div>
        </aside>
      )}

      {/* ── PREVIEW ──────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
        {/* Preview bar */}
        <div className="shrink-0 px-5 h-12 border-b border-gray-200 bg-white flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50 shrink-0"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Painel
            </button>
          )}
          <span className="text-xs text-gray-400 truncate">
            {loading
              ? "A gerar conteúdo..."
              : content
              ? content.main_keyword
              : "Preenche o formulário e clica em Gerar Página"}
          </span>
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-6">
          <PreviewPane html={content?.html ?? null} videoUrl={videoUrl} loading={loading} generationMode={content?.generation_mode} />
        </div>
      </div>

      {/* Media Picker Modal */}
      {mediaModal?.open && (
        <MediaPickerModal
          isOpen
          onClose={() => setMediaModal(null)}
          mode={mediaModal.mode}
          onConfirmVideo={(url) => {
            setVideoUrl(url);
            setMediaModal(null);
          }}
          onConfirmImages={(urls) => {
            setImages(Array.from({ length: 8 }, (_, i) => urls[i] ?? ""));
            setMediaModal(null);
          }}
          initialVideoUrl={videoUrl}
          initialImages={images.filter(Boolean)}
        />
      )}
    </div>
  );
}
