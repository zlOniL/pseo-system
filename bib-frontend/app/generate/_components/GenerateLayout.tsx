"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Content, RelatedService, WpCategory } from "@/lib/types";
import { ScoreCard } from "./ScoreCard";
import { PreviewPane } from "./PreviewPane";

const IMAGE_HINTS = [
  "Antes de Procura em Buscadores",
  "Antes de Principais Problemas",
  "Antes de Serviços (subcategorias)",
  "Antes de Como Funciona / Tipos",
  "Antes de Prevenção e Manutenção",
  "Antes de Sistemas e Intervenções",
  "Dentro de Sistemas e Intervenções",
  "Antes de Perguntas Frequentes",
];

export function GenerateLayout() {
  const router = useRouter();

  // Sidebar
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Form fields
  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [keyword, setKeyword] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [images, setImages] = useState(["", "", "", "", "", "", "", ""]);
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>([{ name: "", url: "" }]);
  const [wpCategory, setWpCategory] = useState("");
  const [wpCategories, setWpCategories] = useState<WpCategory[]>([]);

  // State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoKeyword = service
    ? city ? `${service} em ${city}` : service
    : "";

  useEffect(() => {
    api.getWpCategories().then(setWpCategories).catch(() => {});
  }, []);

  function addRelatedService() {
    setRelatedServices((p) => [...p, { name: "", url: "" }]);
  }
  function removeRelatedService(i: number) {
    setRelatedServices((p) => p.filter((_, idx) => idx !== i));
  }
  function updateRelatedService(i: number, field: keyof RelatedService, value: string) {
    setRelatedServices((p) => p.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  }
  function updateImage(i: number, value: string) {
    setImages((p) => p.map((v, idx) => (idx === i ? value : v)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const validRelated = relatedServices.filter((s) => s.name.trim() && s.url.trim());
    const hasAnyImage = images.some((u) => u.trim());

    try {
      const content = await api.generate({
        main_keyword: keyword || autoKeyword,
        service,
        city: city || undefined,
        min_words: 5000,
        related_services: validRelated.length > 0 ? validRelated : undefined,
        images: hasAnyImage ? images : undefined,
        video_url: videoUrl.trim() || undefined,
        skip_backlinks: true,
        wordpress_category: wpCategory || undefined,
      });
      setResult(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────── */}
      {sidebarOpen && (
        <aside className="w-[400px] shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          {/* Sidebar header */}
          <div className="shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Nova página SEO</h2>
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

          {/* Sidebar form */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <form onSubmit={handleSubmit} className="space-y-5">

              {/* Serviço + Cidade */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Serviço *</label>
                  <input
                    required
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    placeholder="ex: Reparação de Janelas"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Cidade <span className="text-gray-400 font-normal">(opcional)</span>
                  </label>
                  <input
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="ex: Lisboa"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">
                    Palavra-chave{" "}
                    <span className="text-gray-400 font-normal">
                      (auto: &quot;{autoKeyword || "Serviço"}&quot;)
                    </span>
                  </label>
                  <input
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={autoKeyword || "Deixar em branco para auto"}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                  />
                </div>
              </div>

              {/* Categoria WordPress */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Categoria WordPress <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select
                  value={wpCategory}
                  onChange={(e) => setWpCategory(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                >
                  <option value="">Apenas Blog (padrão)</option>
                  {wpCategories.map((cat) => (
                    <option key={cat.id} value={cat.name}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-100" />

              {/* Vídeo */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  URL do Vídeo{" "}
                  <span className="text-gray-400 font-normal">(MP4 — topo da página)</span>
                </label>
                <input
                  value={videoUrl}
                  onChange={(e) => setVideoUrl(e.target.value)}
                  placeholder="https://site.pt/wp-content/.../video.mp4"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                />
              </div>

              {/* Imagens */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Imagens{" "}
                  <span className="text-gray-400 font-normal">(8 URLs WordPress)</span>
                </label>
                <div className="space-y-2">
                  {images.map((url, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <span className="text-xs text-gray-400 w-4 shrink-0 text-center font-medium">{i + 1}</span>
                      <input
                        value={url}
                        onChange={(e) => updateImage(i, e.target.value)}
                        placeholder={IMAGE_HINTS[i]}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-1.5 text-xs text-gray-400">Campos vazios são ignorados — as posições das restantes são preservadas.</p>
              </div>

              {/* Divisor */}
              <div className="border-t border-gray-100" />

              {/* Serviços relacionados */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Serviços complementares{" "}
                  <span className="text-gray-400 font-normal">(links internos)</span>
                </label>
                <div className="space-y-2">
                  {relatedServices.map((s, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input
                        value={s.name}
                        onChange={(e) => updateRelatedService(i, "name", e.target.value)}
                        placeholder="Nome"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                      />
                      <input
                        value={s.url}
                        onChange={(e) => updateRelatedService(i, "url", e.target.value)}
                        placeholder="URL"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => removeRelatedService(i)}
                        className="text-gray-300 hover:text-red-400 transition-colors px-1 shrink-0"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addRelatedService}
                  className="mt-2 text-xs text-gray-500 hover:text-gray-800 transition-colors"
                >
                  + Adicionar serviço
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-xs">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gray-900 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {loading ? "A gerar..." : "Gerar Página"}
              </button>

              {/* Score após geração */}
              {result && (
                <div className="space-y-2">
                  <ScoreCard content={result} />
                  <button
                    type="button"
                    onClick={() => router.push(`/contents/${result.id}`)}
                    className="w-full bg-white border border-gray-200 text-gray-700 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-50 transition-colors"
                  >
                    Abrir página gerada →
                  </button>
                </div>
              )}
            </form>
          </div>
        </aside>
      )}

      {/* ── Preview panel ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 min-w-0">
        {/* Preview header */}
        <div className="shrink-0 px-5 h-12 border-b border-gray-200 bg-white flex items-center gap-3">
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-900 transition-colors border border-gray-200 rounded-md px-2.5 py-1.5 hover:bg-gray-50"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Mostrar formulário
            </button>
          )}
          <span className="text-xs text-gray-400">
            {loading
              ? "A gerar conteúdo..."
              : result
              ? result.main_keyword
              : "Preenche o formulário e clica em Gerar Página"}
          </span>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-6">
          <PreviewPane html={result?.html ?? null} videoUrl={videoUrl} loading={loading} />
        </div>
      </div>
    </div>
  );
}
