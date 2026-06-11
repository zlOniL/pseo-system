'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Content, ContentSection } from '@/lib/types';

function sectionLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function sectionValue(section: ContentSection): string {
  if (section.output_format === 'html') return section.html ?? '';
  return JSON.stringify(section.content_json ?? {}, null, 2);
}

export function ContentSectionsPanel({
  content,
  onContentUpdated,
  onSectionUpdated,
  selectedSectionKey,
  onSelectedSectionChange,
}: {
  content: Content;
  onContentUpdated: (content: Content) => void;
  onSectionUpdated?: () => void;
  selectedSectionKey?: string;
  onSelectedSectionChange?: (sectionKey: string) => void;
}) {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);

  const selected =
    sections.find((section) => section.section_key === selectedKey) ?? null;

  useEffect(() => {
    let cancelled = false;
    api
      .getContentSections(content.id)
      .then((items) => {
        if (cancelled) return;
        setSections(items);
        const first = items[0] ?? null;
        setSelectedKey(first?.section_key ?? '');
        setDraft(first ? sectionValue(first) : '');
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, [content.id]);

  useEffect(() => {
    if (!selectedSectionKey || selectedSectionKey === selectedKey) return;
    const section = sections.find(
      (item) => item.section_key === selectedSectionKey,
    );
    if (section) selectSection(section);
  }, [selectedSectionKey, selectedKey, sections]);

  function selectSection(section: ContentSection) {
    setSelectedKey(section.section_key);
    setDraft(sectionValue(section));
    setFeedback('');
    onSelectedSectionChange?.(section.section_key);
  }

  async function saveSection() {
    if (!selected) return;
    setLoading(true);
    try {
      const payload =
        selected.output_format === 'html'
          ? { html: draft }
          : { content_json: JSON.parse(draft) as unknown };
      const result = await api.updateContentSection(
        content.id,
        selected.section_key,
        payload,
      );
      setSections((current) =>
        current.map((section) =>
          section.section_key === result.section.section_key
            ? result.section
            : section,
        ),
      );
      setDraft(sectionValue(result.section));
      onContentUpdated(result.content);
      onSectionUpdated?.();
      toast.success('Secao guardada.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao guardar secao.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function regenerateSection() {
    if (!selected) return;
    setLoading(true);
    try {
      const result = await api.regenerateContentSection(
        content.id,
        selected.section_key,
        {
          feedback: feedback.trim() || undefined,
        },
      );
      setSections((current) =>
        current.map((section) =>
          section.section_key === result.section.section_key
            ? result.section
            : section,
        ),
      );
      setDraft(sectionValue(result.section));
      onContentUpdated(result.content);
      onSectionUpdated?.();
      setFeedback('');
      toast.success('Secao regenerada.');
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Erro ao regenerar secao.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  if (!sections.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs text-gray-400">
        Sem secoes auditaveis. Gere novamente com a pipeline por secoes e rode a
        migration content_sections.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Secoes
        </p>
        <span className="text-xs text-gray-400">{sections.length} itens</span>
      </div>

      <div className="grid max-h-44 grid-cols-2 gap-1 overflow-y-auto">
        {sections.map((section) => (
          <button
            key={section.id}
            type="button"
            onClick={() => selectSection(section)}
            className={`rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
              selectedKey === section.section_key
                ? 'border-gray-900 bg-gray-900 text-white'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className="block truncate capitalize">
              {sectionLabel(section.section_key)}
            </span>
            <span
              className={
                selectedKey === section.section_key
                  ? 'text-gray-300'
                  : 'text-gray-400'
              }
            >
              {section.word_count} palavras
            </span>
            {section.generation_status !== 'done' && (
              <span
                className={
                  selectedKey === section.section_key
                    ? 'mt-0.5 block text-[10px] text-gray-300'
                    : 'mt-0.5 block text-[10px] text-amber-600'
                }
              >
                {section.generation_status}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium capitalize text-gray-700">
              {sectionLabel(selected.section_key)}
            </span>
            <span className="text-xs text-gray-400">
              {selected.output_format}
            </span>
          </div>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={8}
            className="w-full resize-y rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-800 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={2}
            placeholder="Feedback opcional para regenerar esta secao"
            className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-800 placeholder:text-gray-400 focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={saveSection}
              disabled={loading}
              className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-gray-800 disabled:opacity-40"
            >
              Guardar secao
            </button>
            <button
              type="button"
              onClick={regenerateSection}
              disabled={loading}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-40"
            >
              Regenerar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
