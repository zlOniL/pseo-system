"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Content } from "@/lib/types";

export function RegenerateForm({ content }: { content: Content }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleRegenerate() {
    setLoading(true);
    try {
      await api.regenerate({
        content_id: content.id,
        main_keyword: content.main_keyword,
        service: content.service,
        city: content.city,
        neighborhood: content.neighborhood ?? undefined,
        feedback: feedback || undefined,
      });
      toast.success("Página regenerada com sucesso!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao regenerar");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
      <p className="text-xs font-medium text-gray-700">Feedback para a regeneração</p>
      <textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="ex: Adicionar mais contexto sobre Lisboa, melhorar a secção de serviços..."
        rows={3}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 bg-white resize-none"
      />
      <button
        onClick={handleRegenerate}
        disabled={loading}
        className="w-full bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition-colors"
      >
        {loading ? "A regenerar... (pode demorar 30-60s)" : "Regenerar página"}
      </button>
    </div>
  );
}
