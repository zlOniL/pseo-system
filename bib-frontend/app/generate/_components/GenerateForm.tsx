"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ScoreCard } from "./ScoreCard";
import { Content, RelatedService } from "@/lib/types";
import { CITIES_DATA } from "@/lib/cities";

const IMAGE_PLACEHOLDERS = [
  "Imagem 1 — antes de Procura em Buscadores",
  "Imagem 2 — antes de Principais Problemas",
  "Imagem 3 — antes de Serviços (subcategorias)",
  "Imagem 4 — antes de Como Funciona / Tipos",
  "Imagem 5 — antes de Prevenção e Manutenção",
  "Imagem 6 — antes de contexto local / cidade",
  "Imagem 7 — dentro de Sistemas e Intervenções",
  "Imagem 8 — antes de Perguntas Frequentes",
];

export function GenerateForm() {
  const router = useRouter();
  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [openCity, setOpenCity] = useState<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [relatedServices, setRelatedServices] = useState<RelatedService[]>([
    { name: "", url: "" },
  ]);
  const [videoUrl, setVideoUrl] = useState("");
  const [images, setImages] = useState<string[]>(["", "", "", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Content | null>(null);
  const [error, setError] = useState<string | null>(null);

  const autoKeyword = service && city ? `${service} em ${city}` : "";

  function addRelatedService() {
    setRelatedServices((prev) => [...prev, { name: "", url: "" }]);
  }

  function removeRelatedService(i: number) {
    setRelatedServices((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateRelatedService(i: number, field: keyof RelatedService, value: string) {
    setRelatedServices((prev) =>
      prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s))
    );
  }

  function updateImage(i: number, value: string) {
    setImages((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const validRelated = relatedServices.filter((s) => s.name.trim() && s.url.trim());
    // Send full array to preserve positional mapping (IMAGE_1..IMAGE_8).
    // Backend handles empty strings by removing the placeholder cleanly.
    const hasAnyImage = images.some((u) => u.trim());

    try {
      const content = await api.generate({
        main_keyword: keyword || autoKeyword,
        service,
        city,
        neighborhood: neighborhood || undefined,
        min_words: 5000,
        related_services: validRelated.length > 0 ? validRelated : undefined,
        images: hasAnyImage ? images : undefined,
        video_url: videoUrl.trim() || undefined,
      });
      setResult(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <form onSubmit={handleSubmit} className="space-y-4">

        {/* ── Dados principais ── */}
        <div>
          <label className="block text-sm font-medium mb-1">Serviço *</label>
          <input
            required
            value={service}
            onChange={(e) => setService(e.target.value)}
            placeholder="ex: Reparação de Janelas"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {/* ── Cidade / Bairro (acordeão) ── */}
        <div>
          <label className="block text-sm font-medium mb-1">
            Cidade / Bairro *
          </label>

          {/* Valor seleccionado */}
          {city ? (
            <div className="flex items-center gap-2 mb-2">
              <span className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50 text-gray-800">
                {city}
              </span>
              <button
                type="button"
                onClick={() => setCity("")}
                className="text-gray-400 hover:text-gray-700 text-xs px-2 py-1 border border-gray-200 rounded"
              >
                limpar
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mb-2">Seleccione uma cidade ou bairro abaixo</p>
          )}

          {/* Acordeão de cidades */}
          <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
            {CITIES_DATA.map((group) => (
              <div key={group.city}>
                <button
                  type="button"
                  onClick={() =>
                    setOpenCity(openCity === group.city ? null : group.city)
                  }
                  className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <span>{group.city}</span>
                  <span className="text-gray-400 text-xs">
                    {openCity === group.city ? "▲" : "▼"}
                  </span>
                </button>
                {openCity === group.city && (
                  <div className="px-3 py-2 bg-gray-50 flex flex-wrap gap-1.5">
                    {group.places.map((place) => (
                      <button
                        key={place}
                        type="button"
                        onClick={() => {
                          setCity(place);
                          setOpenCity(null);
                        }}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          city === place
                            ? "bg-gray-800 text-white border-gray-800"
                            : "bg-white text-gray-600 border-gray-200 hover:border-gray-400 hover:text-gray-900"
                        }`}
                      >
                        {place}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Campo hidden para garantir validação do formulário */}
          <input
            type="text"
            required
            value={city}
            onChange={() => {}}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Palavra-chave{" "}
            <span className="text-gray-400 font-normal">
              (auto: &quot;{autoKeyword || "Serviço em Cidade"}&quot;)
            </span>
          </label>
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={autoKeyword || "Deixar em branco para auto-preencher"}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            Bairro específico{" "}
            <span className="text-gray-400 font-normal">(opcional — adiciona contexto extra)</span>
          </label>
          <input
            value={neighborhood}
            onChange={(e) => setNeighborhood(e.target.value)}
            placeholder="ex: Belém"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ── Vídeo ── */}
        <div>
          <label className="block text-sm font-medium mb-1">
            URL do Vídeo{" "}
            <span className="text-gray-400 font-normal">(MP4 do WordPress — aparece no topo da página)</span>
          </label>
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="ex: https://site.pt/wp-content/uploads/.../video.mp4"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* ── Imagens ── */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Imagens do WordPress{" "}
            <span className="text-gray-400 font-normal">(URLs — 8 imagens, uma por secção)</span>
          </label>
          <div className="space-y-2">
            {images.map((url, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-xs text-gray-500 w-4 shrink-0 font-medium">{i + 1}</span>
                <input
                  value={url}
                  onChange={(e) => updateImage(i, e.target.value)}
                  placeholder={IMAGE_PLACEHOLDERS[i]}
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-gray-400">
            Campos em branco são ignorados. As imagens são separadas por &lt;hr&gt; e inseridas nas posições indicadas.
          </p>
        </div>

        {/* ── Serviços complementares / backlinks ── */}
        <div>
          <label className="block text-sm font-medium mb-2">
            Serviços complementares{" "}
            <span className="text-gray-400 font-normal">(links internos no corpo do texto)</span>
          </label>
          <div className="space-y-2">
            {relatedServices.map((s, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input
                  value={s.name}
                  onChange={(e) => updateRelatedService(i, "name", e.target.value)}
                  placeholder="Nome (ex: Canalizadores)"
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <input
                  value={s.url}
                  onChange={(e) => updateRelatedService(i, "url", e.target.value)}
                  placeholder="URL (ex: https://site.pt/canalizadores/)"
                  className="flex-1 border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={() => removeRelatedService(i)}
                  className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                  title="Remover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addRelatedService}
            className="mt-2 text-blue-600 hover:underline text-xs"
          >
            + Adicionar serviço
          </button>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "A gerar... (pode demorar 30-60s)" : "Gerar Página"}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded p-3 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <ScoreCard content={result} />
          <button
            onClick={() => router.push(`/contents/${result.id}`)}
            className="w-full bg-gray-800 text-white rounded px-4 py-2 text-sm font-medium hover:bg-gray-900"
          >
            Ver página gerada →
          </button>
        </div>
      )}
    </div>
  );
}
