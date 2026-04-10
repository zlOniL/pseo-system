import { Injectable } from '@nestjs/common';
import { parse } from 'node-html-parser';
import { ValidationResult } from './validation.types';

const REQUIRED_H2S = [
  'Procura em Buscadores',
  'Principais Problemas',
  'Serviços',
  'Como Funciona',
  'Tipos de',
  'Prevenção e Manutenção',
  'Atendemos Também',
  'Sistemas e Intervenções',
  'Serviços Especializados',
  'Perguntas Frequentes',
  'Pesquisas Relacionadas',
  'Conclusão',
];

@Injectable()
export class ValidationService {
  validate(html: string, mainKeyword: string, minWords = 800): ValidationResult {
    const root = parse(html);
    const issues: string[] = [];

    // ── Structure checks (30 pts) ─────────────────────────────────────
    let structure = 0;

    const h1 = root.querySelector('h1');
    const allHeadings = root.querySelectorAll('h1, h2, h3');
    const h1IsFirst = allHeadings.length > 0 && allHeadings[0].tagName === 'H1';

    if (h1 && h1IsFirst) {
      structure += 10;
    } else {
      if (!h1) issues.push('H1 ausente');
      else issues.push('H1 não é o primeiro heading da página');
    }

    const h2Texts = root.querySelectorAll('h2').map((el) => el.text.trim());
    const presentH2s = REQUIRED_H2S.filter((req) =>
      h2Texts.some((t) => t.toLowerCase().includes(req.toLowerCase())),
    );
    const missingH2s = REQUIRED_H2S.filter(
      (req) => !h2Texts.some((t) => t.toLowerCase().includes(req.toLowerCase())),
    );

    const h2Score = Math.round((presentH2s.length / REQUIRED_H2S.length) * 10);
    structure += h2Score;
    if (missingH2s.length > 0) {
      issues.push(`H2s em falta: ${missingH2s.join(', ')}`);
    }

    // Check order: first present required H2 should come before last present required H2
    // Simple check: all required H2s appear in the correct relative order
    const h2Order = presentH2s.every((req, i) => {
      const posReq = h2Texts.findIndex((t) => t.toLowerCase().includes(req.toLowerCase()));
      if (i === 0) return true;
      const prevReq = presentH2s[i - 1];
      const posPrev = h2Texts.findIndex((t) => t.toLowerCase().includes(prevReq.toLowerCase()));
      return posReq > posPrev;
    });

    if (h2Order) {
      structure += 10;
    } else {
      issues.push('Ordem dos H2 não corresponde ao template');
    }

    // ── SEO checks (40 pts) ───────────────────────────────────────────
    let seo = 0;
    const kwLower = mainKeyword.toLowerCase();
    const h1Text = h1?.text.toLowerCase() ?? '';

    if (h1Text.includes(kwLower)) {
      seo += 20;
    } else {
      issues.push(`Palavra-chave "${mainKeyword}" ausente no H1`);
    }

    const h2WithKw = h2Texts.filter((t) => t.toLowerCase().includes(kwLower));
    if (h2WithKw.length >= 2) {
      seo += 10;
    } else if (h2WithKw.length === 1) {
      seo += 5;
      issues.push(`Palavra-chave presente em apenas 1 H2 (mínimo: 2)`);
    } else {
      issues.push(`Palavra-chave ausente nos H2s`);
    }

    const bodyText = root.text.toLowerCase();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    const kwCount = (bodyText.match(new RegExp(kwLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length;
    const density = wordCount > 0 ? (kwCount / wordCount) * 100 : 0;

    if (density >= 1.0 && density <= 2.5) {
      seo += 10;
    } else if (density < 1.0) {
      issues.push(`Densidade da keyword baixa (${density.toFixed(2)}% — mínimo 1.0%)`);
    } else {
      issues.push(`Densidade da keyword alta (${density.toFixed(2)}% — máximo 2.5%)`);
    }

    // ── Content checks (30 pts) ───────────────────────────────────────
    let content = 0;

    if (wordCount >= minWords) {
      content += 20;
    } else {
      issues.push(`Contagem de palavras insuficiente (${wordCount} — mínimo ${minWords})`);
    }

    const hasUnfilledPlaceholders = /\{\{[^}]+\}\}/.test(html);
    if (!hasUnfilledPlaceholders) {
      content += 10;
    } else {
      issues.push('Existem placeholders {{...}} não preenchidos');
    }

    const score = Math.min(100, structure + seo + content);

    return {
      score,
      issues,
      breakdown: { structure, seo, content },
    };
  }
}
