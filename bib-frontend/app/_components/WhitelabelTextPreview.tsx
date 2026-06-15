import { WhitelabelContentJson } from '@/lib/types';

function text(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return JSON.stringify(value, null, 2);
  return '';
}

function Block({ block }: { block: Record<string, unknown> }) {
  const type = String(block.type ?? 'paragraph');
  if (['heading', 'subheading', 'minor_heading'].includes(type)) {
    const level = Number(block.level ?? (type === 'subheading' ? 3 : type === 'minor_heading' ? 4 : 2));
    const className =
      level === 4
        ? 'text-sm font-semibold text-gray-900 mt-3'
        : level === 3
          ? 'text-base font-semibold text-gray-900 mt-4'
          : 'text-lg font-semibold text-gray-900 mt-5';
    return <h3 className={className}>{text(block.text)}</h3>;
  }
  if (type === 'list' && Array.isArray(block.items)) {
    return (
      <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
        {block.items.map((item, idx) => <li key={idx}>{text(item)}</li>)}
      </ul>
    );
  }
  if (type === 'callout') {
    return <p className="text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg p-3">{text(block.text)}</p>;
  }
  if (type === 'faq_list' && Array.isArray(block.items)) {
    return (
      <div className="space-y-3">
        {!block.hide_title && Boolean(block.title) && <h3 className="text-base font-semibold text-gray-900 mt-5">{text(block.title)}</h3>}
        {block.items.map((faq, idx) => {
          const item = faq as Record<string, unknown>;
          return (
            <div key={idx} className="border-t border-gray-100 pt-3">
              <h4 className="text-sm font-semibold text-gray-900">{text(item.question)}</h4>
              <p className="text-sm leading-6 text-gray-700 mt-1">{text(item.answer)}</p>
            </div>
          );
        })}
      </div>
    );
  }
  return <p className="text-sm leading-6 text-gray-700">{text(block.text ?? block)}</p>;
}

export function WhitelabelTextPreview({ content }: { content: WhitelabelContentJson | null }) {
  if (!content) {
    return <div className="text-sm text-gray-400">Sem conteúdo textual.</div>;
  }

  const article = Array.isArray(content.article)
    ? content.article
    : content.article?.blocks ?? [];
  const hero = content.hero ?? {};
  const form = content.form ?? {};

  return (
    <div className="max-w-4xl mx-auto bg-white border border-gray-200 rounded-xl shadow-sm p-8 space-y-8">
      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Hero</p>
        {Boolean(hero.badge) && <p className="text-xs font-medium text-gray-500">{text(hero.badge)}</p>}
        <h1 className="text-2xl font-semibold text-gray-950">{text(hero.h1)}</h1>
        <p className="text-sm leading-6 text-gray-700">{text(hero.intro)}</p>
        {Array.isArray(hero.bullets) && (
          <ul className="list-disc pl-5 text-sm text-gray-700 space-y-1">
            {hero.bullets.map((item, idx) => <li key={idx}>{text(item)}</li>)}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <p className="text-xs uppercase tracking-wide text-gray-400">Formulário</p>
        <h2 className="text-lg font-semibold text-gray-900">{text(form.title)}</h2>
        <p className="text-sm text-gray-700">{text(form.description)}</p>
      </section>

      <section className="space-y-3">
        <p className="text-xs uppercase tracking-wide text-gray-400">Artigo</p>
        {article.map((block, idx) => <Block key={idx} block={block} />)}
      </section>

    </div>
  );
}
