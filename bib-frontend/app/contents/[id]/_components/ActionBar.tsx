"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Content } from "@/lib/types";
import { RegenerateForm } from "./RegenerateForm";
import { ScoreCard } from "@/app/generate/_components/ScoreCard";

export function ActionBar({ content }: { content: Content }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      await api.approveContent(content.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao aprovar");
    } finally {
      setLoading(false);
    }
  }

  async function handlePublish() {
    setLoading(true);
    setError(null);
    try {
      await api.publishContent(content.id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao publicar");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setLoading(true);
    try {
      await api.deleteContent(content.id);
      router.push("/contents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao apagar");
      setLoading(false);
      setConfirmDelete(false);
    }
  }

  const isPublished = content.status === "published";

  return (
    <div className="space-y-4">
      <ScoreCard content={content} />

      <div className="flex flex-wrap gap-2 items-center">
        {content.status === "draft" && (
          <button
            onClick={handleApprove}
            disabled={loading}
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Aprovar
          </button>
        )}

        {content.status === "approved" && (
          <button
            onClick={handlePublish}
            disabled={loading}
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            Publicar no WordPress
          </button>
        )}

        {isPublished && content.wp_post_url && (
          <a
            href={content.wp_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white text-emerald-700 border border-emerald-200 rounded-lg px-4 py-2 text-sm font-medium hover:bg-emerald-50 transition-colors"
          >
            Ver no WordPress ↗
          </a>
        )}

        <button
          onClick={() => setShowRegenerate((v) => !v)}
          className="bg-white text-gray-700 border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          {showRegenerate ? "Fechar" : "Regenerar"}
        </button>

        {/* Delete — desativado se publicado */}
        {isPublished ? (
          <span className="text-xs text-gray-400 ml-auto">
            Página publicada — não pode ser apagada
          </span>
        ) : confirmDelete ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-500">Tens a certeza?</span>
            <button
              onClick={handleDelete}
              disabled={loading}
              className="text-xs text-red-600 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              {loading ? "..." : "Apagar"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={handleDelete}
            className="ml-auto text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:border-red-200 hover:bg-red-50 transition-colors"
          >
            Apagar
          </button>
        )}
      </div>

      {error && <p className="text-red-600 text-sm">{error}</p>}

      {showRegenerate && <RegenerateForm content={content} />}
    </div>
  );
}
