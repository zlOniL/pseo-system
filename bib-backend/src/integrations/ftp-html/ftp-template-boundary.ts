export interface FtpTemplateParts {
  documentPrefix: string;
  managedContent: string;
  documentSuffix: string;
  boundaryConfig: {
    prefix_ends_after: '</main>';
    suffix_starts_at: '<footer';
    main_close_index: number;
    footer_start_index: number;
  };
}

export interface FtpTemplateBoundaryIssue {
  reason:
    | 'missing_main_close'
    | 'multiple_main_close'
    | 'missing_footer'
    | 'multiple_footer'
    | 'footer_before_main';
}

export function extractFtpTemplateParts(
  html: string,
): FtpTemplateParts | FtpTemplateBoundaryIssue {
  const lower = html.toLowerCase();
  const mainMatches = [...lower.matchAll(/<\/main>/g)].map((item) => item.index);
  if (mainMatches.length === 0) return { reason: 'missing_main_close' };
  if (mainMatches.length > 1) return { reason: 'multiple_main_close' };

  const footerMatches = [...lower.matchAll(/<footer\b/g)].map(
    (item) => item.index,
  );
  if (footerMatches.length === 0) return { reason: 'missing_footer' };
  if (footerMatches.length > 1) return { reason: 'multiple_footer' };

  const mainCloseIndex = mainMatches[0]!;
  const footerStartIndex = footerMatches[0]!;
  const prefixEnd = mainCloseIndex + '</main>'.length;
  if (footerStartIndex <= prefixEnd) return { reason: 'footer_before_main' };

  return {
    documentPrefix: html.slice(0, prefixEnd),
    managedContent: html.slice(prefixEnd, footerStartIndex),
    documentSuffix: html.slice(footerStartIndex),
    boundaryConfig: {
      prefix_ends_after: '</main>',
      suffix_starts_at: '<footer',
      main_close_index: mainCloseIndex,
      footer_start_index: footerStartIndex,
    },
  };
}
