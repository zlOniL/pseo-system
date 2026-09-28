'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { Content } from '@/lib/types';
import { WhitelabelTextPreview } from './WhitelabelTextPreview';
import { HtmlPreview } from '@/app/contents/[id]/_components/HtmlPreview';

export function LocalityLinksRefresh({
  content,
  onUpdated,
  disabled,
}: {
  content: Content;
  onUpdated: (content: Content) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof api.previewLocalityLinks>
  > | null>(null);

  async function open() {
    setBusy(true);
    try {
      setPreview(await api.previewLocalityLinks(content.id));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao preparar os links',
      );
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const updated = await api.refreshLocalityLinks(content.id);
      onUpdated(updated);
      setPreview(null);
      toast.success('Links atualizados. Revise o rascunho antes de publicar.');
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Erro ao atualizar os links',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy || disabled}
        className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        {busy ? 'A preparar…' : 'Atualizar “Também atendemos”'}
      </button>
      {preview && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Revisar links de localidades"
        >
          <div className="mx-auto max-w-5xl space-y-4 rounded-xl bg-gray-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Também atendemos — revisão</h2>
                <p className="text-sm text-gray-600">
                  {preview.link_count} links.{' '}
                  {preview.changed
                    ? 'Ao guardar, a página volta a rascunho. A publicação atual só muda quando republicar.'
                    : 'Os links já estão atualizados.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPreview(null)}
                  disabled={busy}
                  className="rounded-lg border px-3 py-2 text-sm"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={apply}
                  disabled={busy || !preview.changed}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-sm text-white disabled:opacity-40"
                >
                  {busy ? 'A guardar…' : 'Guardar rascunho'}
                </button>
              </div>
            </div>
            {preview.content.output_format === 'whitelabel_json' ? (
              <WhitelabelTextPreview content={preview.content.content_json} />
            ) : (
              <HtmlPreview
                html={preview.content.html ?? ''}
                videoUrl={preview.content.video_url ?? undefined}
                generationMode={preview.content.generation_mode}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}
