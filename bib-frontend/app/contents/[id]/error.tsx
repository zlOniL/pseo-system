'use client';

export default function ContentError({ reset }: { reset: () => void }) {
  return <div role="alert" className="p-8 space-y-4">
    <h1 className="text-lg font-semibold">Não foi possível carregar a página</h1>
    <p>Ocorreu uma falha de carregamento. Isto não significa que o conteúdo foi apagado.</p>
    <button onClick={reset} className="bib-btn bib-btn-primary">Tentar novamente</button>
  </div>;
}
