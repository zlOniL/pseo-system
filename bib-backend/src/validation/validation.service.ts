import { Injectable } from '@nestjs/common';
import { parse } from 'node-html-parser';
import { ValidationResult } from './validation.types';

@Injectable()
export class ValidationService {
  validate(
    html: string,
    mainKeyword: string,
    minWords = 800,
  ): ValidationResult {
    const document = parse(html);
    const contentRoot = document.querySelector('.pseo-content') ?? document;
    const root = document;
    const issues: string[] = [];

    let structure = 0;

    const h1s = root.querySelectorAll('h1');
    const h2s = root.querySelectorAll('h2');
    const h3s = root.querySelectorAll('h3');
    const h4Plus = root.querySelectorAll('h4, h5, h6');
    const allHeadings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const h1 = h1s[0];
    const expectedCounts = [
      ['H1', h1s.length],
      ['H2', h2s.length],
      ['H3', h3s.length],
    ] as const;
    let validHeadingCounts = true;
    for (const [tag, count] of expectedCounts) {
      if (count !== 1) {
        validHeadingCounts = false;
        issues.push(
          `[BLOQUEIO] ${tag}: esperado exatamente 1, encontrados ${count}`,
        );
      }
    }
    const firstContentHeading = allHeadings.find((heading) =>
      heading.text.trim(),
    );
    if (!h1 || firstContentHeading !== h1) {
      validHeadingCounts = false;
      issues.push('[BLOQUEIO] O H1 deve ser o primeiro titulo do conteudo');
    }
    for (const heading of allHeadings) {
      if (!heading.text.trim()) {
        validHeadingCounts = false;
        issues.push(`[BLOQUEIO] ${heading.tagName} vazio`);
      }
    }
    if (validHeadingCounts) structure += 20;
    else if (h1s.length === 1) structure += 10;

    const headingOrder = allHeadings.every((heading, index) => {
      if (index === 0) return heading.tagName === 'H1';
      const previousLevel = Number(allHeadings[index - 1].tagName.slice(1));
      const level = Number(heading.tagName.slice(1));
      return level <= previousLevel + 1;
    });
    if (!headingOrder) {
      validHeadingCounts = false;
      issues.push('[BLOQUEIO] Hierarquia de headings com salto de nivel');
    }
    if (h4Plus.length > 0) structure += 10;

    let seo = 0;
    const kwLower = mainKeyword.toLowerCase();
    const h1Text = h1?.text.toLowerCase() ?? '';

    if (h1Text.includes(kwLower)) {
      seo += 20;
    } else {
      issues.push(`Palavra-chave "${mainKeyword}" ausente no H1`);
    }

    const h2WithKw = h2s.filter((el) =>
      el.text.toLowerCase().includes(kwLower),
    );
    if (h2WithKw.length === 1) {
      seo += 10;
    } else {
      issues.push('Palavra-chave ausente nos H2s');
    }

    const bodyText = contentRoot.text.toLowerCase();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    const kwCount = (
      bodyText.match(
        new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      ) ?? []
    ).length;
    const density = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;

    if (density >= 1.0 && density <= 2.5) {
      seo += 10;
    } else if (density < 1.0) {
      issues.push(
        `Densidade da keyword baixa (${density.toFixed(2)}% - minimo 1.0%)`,
      );
    } else {
      issues.push(
        `Densidade da keyword alta (${density.toFixed(2)}% - maximo 2.5%)`,
      );
    }

    let content = 0;

    if (wordCount >= minWords) {
      content += 20;
    } else {
      issues.push(
        `Contagem de palavras insuficiente (${wordCount} - minimo ${minWords})`,
      );
    }

    const hasUnfilledPlaceholders = /\{\{[^}]+\}\}/.test(html);
    if (!hasUnfilledPlaceholders) {
      content += 10;
    } else {
      issues.push('[BLOQUEIO] Existem placeholders {{...}} nao preenchidos');
    }

    const links = contentRoot.querySelectorAll('a');
    for (const [index, link] of links.entries()) {
      const href = (link.getAttribute('href') ?? '').trim();
      const anchorText =
        link.text.trim() || Boolean(link.querySelector('img[alt]'));
      if (!href || href === '#')
        issues.push(`[AVISO] Link ${index + 1} sem destino valido`);
      if (!anchorText)
        issues.push(`[AVISO] Link ${index + 1} sem texto ancora`);
      if (/^javascript:/i.test(href))
        issues.push(`[BLOQUEIO] Link ${index + 1} usa esquema javascript:`);
      const rel = (link.getAttribute('rel') ?? '').toLowerCase().split(/\s+/);
      if (
        (link.getAttribute('target') ?? '').toLowerCase() === '_blank' &&
        !rel.includes('noopener') &&
        !rel.includes('noreferrer')
      ) {
        issues.push(
          `[AVISO] Link ${index + 1} com target="_blank" sem noopener/noreferrer`,
        );
      }
    }

    for (const heading of allHeadings) {
      if (heading.text.trim().length > 70) {
        issues.push(`[AVISO] ${heading.tagName} acima de 70 caracteres`);
      }
    }

    const titles = document.querySelectorAll('title');
    const descriptions = document
      .querySelectorAll('meta')
      .filter((el) => el.getAttribute('name')?.toLowerCase() === 'description');
    const canonicals = document
      .querySelectorAll('link')
      .filter((el) => el.getAttribute('rel')?.toLowerCase() === 'canonical');
    const isFullDocument = /<\s*head\b/i.test(html);
    if (titles.length > 1)
      issues.push('[BLOQUEIO] Documento com mais de um <title>');
    if (descriptions.length > 1)
      issues.push('[BLOQUEIO] Documento com meta description duplicada');
    if (canonicals.length > 1)
      issues.push('[BLOQUEIO] Documento com canonical duplicado');
    if (isFullDocument) {
      if (titles.length !== 1 || !titles[0]?.text.trim()) {
        issues.push(
          '[BLOQUEIO] Documento deve conter exatamente um title preenchido',
        );
      } else if (
        titles[0].text.trim().length < 30 ||
        titles[0].text.trim().length > 60
      ) {
        issues.push(
          `[AVISO] Title com ${titles[0].text.trim().length} caracteres (referencia: 30-60)`,
        );
      }
      if (
        descriptions.length !== 1 ||
        !descriptions[0]?.getAttribute('content')?.trim()
      ) {
        issues.push(
          '[BLOQUEIO] Documento deve conter exatamente uma meta description preenchida',
        );
      } else {
        const descriptionLength = descriptions[0]
          .getAttribute('content')!
          .trim().length;
        if (descriptionLength < 120 || descriptionLength > 160) {
          issues.push(
            `[AVISO] Meta description com ${descriptionLength} caracteres (referencia: 120-160)`,
          );
        }
      }
      if (
        canonicals.length !== 1 ||
        !canonicals[0]?.getAttribute('href')?.trim()
      ) {
        issues.push(
          '[BLOQUEIO] Documento deve conter exatamente um canonical preenchido',
        );
      }
    }

    const editorialLinks = links.filter(
      (link) => !isInGeneratedLocalityBlock(link),
    );
    if (editorialLinks.length > 40) {
      issues.push(
        `[AVISO] Quantidade alta de links fora dos blocos automáticos de localidades (${editorialLinks.length})`,
      );
    }

    const longParagraphs = contentRoot
      .querySelectorAll('p')
      .filter((paragraph) => {
        const text = paragraph.text.trim();
        const sentences = text
          .split(/[.!?]+/)
          .map((sentence) => sentence.trim())
          .filter(Boolean);
        return sentences.some((sentence) => sentence.split(/\s+/).length > 35);
      }).length;
    if (longParagraphs) {
      issues.push(
        `[AVISO] ${longParagraphs} paragrafo(s) contem frase(s) acima de 35 palavras`,
      );
    }

    const score = Math.min(100, structure + seo + content);

    return {
      score,
      issues,
      breakdown: { structure, seo, content },
    };
  }
}

function isInGeneratedLocalityBlock(element: { parentNode: unknown }): boolean {
  let current = element as any;
  while (current) {
    if (
      current.hasAttribute?.('data-bib-locality-links') ||
      current.hasAttribute?.('data-bib-other-locality-links')
    )
      return true;
    current = current.parentNode;
  }
  return false;
}
