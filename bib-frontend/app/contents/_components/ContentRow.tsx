"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ContentSummary } from "@/lib/types";

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-gray-300 text-xs">—</span>;
  const cls =
    score >= 75
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : score >= 50
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-600 border-red-200";
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${cls}`}>
      {score}
    </span>
  );
}

const statusConfig: Record<string, { label: string; cls: string }> = {
  draft:     { label: "Rascunho",  cls: "text-gray-400" },
  approved:  { label: "Aprovado",  cls: "text-amber-600" },
  published: { label: "Publicado", cls: "text-emerald-600" },
};

interface ContentRowProps {
  content: ContentSummary;
  isSelected?: boolean;
  onToggle?: () => void;
}

export function ContentRow({ content, isSelected, onToggle }: ContentRowProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const st = statusConfig[content.status] ?? { label: content.status, cls: "text-gray-400" };

  async function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await api.deleteContent(content.id);
      toast.success("Conteúdo apagado.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao apagar");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  function handleCancelDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setConfirmDelete(false);
  }

  const isPublished = content.status === "published";

  return (
    <div className={`group flex items-center gap-3 bg-white border rounded-xl px-4 py-3 hover:border-gray-300 hover:shadow-sm transition-all text-sm ${isSelected ? 'border-gray-400 bg-gray-50' : 'border-gray-200'}`}>
      {onToggle && (
        <input
          type="checkbox"
          checked={isSelected ?? false}
          onChange={(e) => { e.stopPropagation(); onToggle(); }}
          className="w-4 h-4 accent-gray-900 shrink-0"
        />
      )}
      <Link href={`/contents/${content.id}`} className="flex-1 min-w-0 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate">{content.main_keyword}</p>
          <p className="text-gray-400 text-xs mt-0.5">{content.city}</p>
        </div>
        <ScoreBadge score={content.score} />
        <span className={`text-xs font-medium ${st.cls} w-20 text-right shrink-0`}>
          {st.label}
        </span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-gray-300 shrink-0">
          <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </Link>

      {/* Delete */}
      {!isPublished && (
        <div className="shrink-0 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {confirmDelete ? (
            <>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="text-xs text-red-600 border border-red-200 rounded-md px-2 py-1 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting ? "..." : "Confirmar"}
              </button>
              <button
                onClick={handleCancelDelete}
                className="text-xs text-gray-500 border border-gray-200 rounded-md px-2 py-1 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </>
          ) : (
            <button
              onClick={handleDelete}
              className="text-xs text-gray-400 hover:text-red-500 border border-gray-200 rounded-md px-2 py-1 hover:border-red-200 hover:bg-red-50 transition-colors"
            >
              Apagar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
