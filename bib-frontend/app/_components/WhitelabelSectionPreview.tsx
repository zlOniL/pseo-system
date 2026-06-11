'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Content, ContentSection } from '@/lib/types';
import { WhitelabelTextPreview } from '@/app/_components/WhitelabelTextPreview';

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

function sectionLabel(key: string): string {
  return key.replace(/_/g, ' ');
}

function Block({ block }: { block: Record<string, unknown> }) {
  const type = String(block.type ?? 'paragraph');
  if (type === 'heading') {
    return (
      <h3 className="mt-4 text-base font-semibold text-gray-950">
        {text(block.text)}
      </h3>
    );
  }
  if (type === 'list' && Array.isArray(block.items)) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700">
        {block.items.map((item, index) => (
          <li key={index}>{text(item)}</li>
        ))}
      </ul>
    );
  }
  if (type === 'callout') {
    return (
      <p className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm leading-6 text-gray-700">
        {text(block.text)}
      </p>
    );
  }
  if (type === 'faq_list' && Array.isArray(block.items)) {
    return (
      <div className="space-y-2">
        {block.items.map((item, index) => (
          <pre
            key={index}
            className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-xs text-gray-600"
          >
            {text(item)}
          </pre>
        ))}
      </div>
    );
  }
  return (
    <p className="text-sm leading-6 text-gray-700">
      {text(block.text ?? block)}
    </p>
  );
}

function IntroSection({ value }: { value: Record<string, unknown> }) {
  const hero = (value.hero ?? {}) as Record<string, unknown>;
  const form = (value.form ?? {}) as Record<string, unknown>;
  return (
    <div className="space-y-3">
      {Boolean(hero.badge) && (
        <p className="text-xs font-medium text-gray-500">{text(hero.badge)}</p>
      )}
      {Boolean(hero.h1) && (
        <h1 className="text-2xl font-semibold text-gray-950">
          {text(hero.h1)}
        </h1>
      )}
      {Boolean(hero.intro) && (
        <p className="text-sm leading-6 text-gray-700">{text(hero.intro)}</p>
      )}
      {Array.isArray(hero.bullets) && (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-gray-700">
          {hero.bullets.map((item, index) => (
            <li key={index}>{text(item)}</li>
          ))}
        </ul>
      )}
      {(Boolean(form.title) || Boolean(form.description)) && (
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
          {Boolean(form.title) && (
            <h2 className="text-base font-semibold text-gray-900">
              {text(form.title)}
            </h2>
          )}
          {Boolean(form.description) && (
            <p className="mt-1 text-sm leading-6 text-gray-600">
              {text(form.description)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SectionContent({ section }: { section: ContentSection }) {
  const value = section.content_json;

  if (section.section_key === 'intro' && value && typeof value === 'object') {
    return <IntroSection value={value as Record<string, unknown>} />;
  }

  if (section.section_key === 'perguntas_frequentes' && Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((faq, index) => {
          const item = faq as { question?: unknown; answer?: unknown };
          return (
            <div key={index} className="border-t border-gray-100 pt-3">
              <h3 className="text-sm font-semibold text-gray-900">
                {text(item.question)}
              </h3>
              <p className="mt-1 text-sm leading-6 text-gray-700">
                {text(item.answer)}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  if (Array.isArray(value)) {
    return (
      <div className="space-y-3">
        {value.map((block, index) =>
          block && typeof block === 'object' ? (
            <Block key={index} block={block as Record<string, unknown>} />
          ) : (
            <p key={index} className="text-sm leading-6 text-gray-700">
              {text(block)}
            </p>
          ),
        )}
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return <Block block={value as Record<string, unknown>} />;
  }

  return <p className="text-sm leading-6 text-gray-700">{text(value)}</p>;
}

export function WhitelabelSectionPreview({
  content,
  refreshKey,
  selectedSectionKey,
  onSectionSelect,
}: {
  content: Content;
  refreshKey?: number;
  selectedSectionKey?: string;
  onSectionSelect?: (sectionKey: string) => void;
}) {
  const [sections, setSections] = useState<ContentSection[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    api
      .getContentSections(content.id)
      .then((items) => {
        if (cancelled) return;
        setSections(
          items.filter((item) => item.output_format === 'whitelabel_json'),
        );
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setSections([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [content.id, refreshKey]);

  if (loaded && sections.length === 0) {
    return <WhitelabelTextPreview content={content.content_json} />;
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-4xl rounded-xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="h-5 w-40 animate-pulse rounded bg-gray-100" />
        <div className="mt-6 space-y-3">
          <div className="h-3 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-gray-100" />
          <div className="h-3 w-2/3 animate-pulse rounded bg-gray-100" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      {sections.map((section) => {
        const selected = selectedSectionKey === section.section_key;
        return (
          <section
            key={section.id}
            onClick={() => onSectionSelect?.(section.section_key)}
            className={`relative cursor-pointer rounded-xl border bg-white p-6 shadow-sm transition ${
              selected
                ? 'border-gray-950 ring-4 ring-gray-900/10'
                : 'border-gray-200 hover:border-gray-900 hover:ring-4 hover:ring-gray-900/5'
            }`}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {sectionLabel(section.section_key)}
              </p>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-500">
                {section.word_count} palavras
              </span>
              {section.generation_status !== 'done' && (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  {section.generation_status}
                </span>
              )}
            </div>
            <SectionContent section={section} />
          </section>
        );
      })}
    </div>
  );
}
