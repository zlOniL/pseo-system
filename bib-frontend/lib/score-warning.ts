import { ContentSummary } from './types';

export function contentQualityWarning(
  contents: Pick<ContentSummary, 'main_keyword' | 'score' | 'score_issues'>[],
): string | null {
  const pages = contents.filter(
    (content) => (content.score !== null && content.score < 70) || (content.score_issues?.length ?? 0) > 0,
  );
  if (pages.length === 0) return null;
  const lowScoreCount = pages.filter((content) => content.score !== null && content.score < 70).length;
  const issueCount = pages.filter((content) => (content.score_issues?.length ?? 0) > 0).length;

  const names = pages
    .slice(0, 5)
    .map((content) => {
      const details = [
        content.score !== null && content.score < 70 ? `score ${content.score}` : null,
        ...(content.score_issues ?? []).slice(0, 2),
      ].filter(Boolean);
      return `${content.main_keyword} (${details.join('; ')})`;
    })
    .join(', ');
  const remaining = pages.length - 5;
  const counts = [
    lowScoreCount > 0 ? `${lowScoreCount} abaixo do score mínimo de 70` : null,
    issueCount > 0 ? `${issueCount} com avisos de montagem/validação` : null,
  ].filter(Boolean).join('; ');
  return `${counts}: ${names}${remaining > 0 ? ` e mais ${remaining}` : ''}.`;
}
