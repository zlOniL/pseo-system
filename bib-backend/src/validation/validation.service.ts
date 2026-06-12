import { Injectable } from '@nestjs/common';
import { parse } from 'node-html-parser';
import { ValidationResult } from './validation.types';

const REQUIRED_H2S: Array<string | string[]> = [
  'Assistencia Especializada',
  'Tipos de',
  'Servicos Realizados',
  'Principais Problemas',
  'Como Funciona',
  '24H/7',
  'Manutencao',
  'Reparar ou Substituir',
  'Por Que Escolher',
  'Integracao',
  ['Contexto Local', 'Zonas de Atendimento'],
  'Perguntas Frequentes',
  'Contacte a Empresa',
  'Mais Sobre',
];

@Injectable()
export class ValidationService {
  validate(
    html: string,
    mainKeyword: string,
    minWords = 800,
  ): ValidationResult {
    const root = parse(html);
    const issues: string[] = [];

    let structure = 0;

    const h1 = root.querySelector('h1');
    const allHeadings = root.querySelectorAll('h1, h2, h3');
    const h1IsFirst = allHeadings.length > 0 && allHeadings[0].tagName === 'H1';

    if (h1 && h1IsFirst) {
      structure += 10;
    } else {
      if (!h1) issues.push('H1 ausente');
      else issues.push('H1 nao e o primeiro heading da pagina');
    }

    const h2Texts = root.querySelectorAll('h2').map((el) => el.text.trim());
    const normalizedH2Texts = h2Texts.map(normalizeText);
    const presentH2s = REQUIRED_H2S.filter((req) =>
      normalizedH2Texts.some((text) =>
        requiredOptions(req).some((option) => text.includes(normalizeText(option))),
      ),
    );
    const missingH2s = REQUIRED_H2S.filter(
      (req) =>
        !normalizedH2Texts.some((text) =>
          requiredOptions(req).some((option) => text.includes(normalizeText(option))),
        ),
    );

    const h2Score = Math.round((presentH2s.length / REQUIRED_H2S.length) * 10);
    structure += h2Score;
    if (missingH2s.length > 0) {
      issues.push(
        `H2s em falta: ${missingH2s.map(requiredLabel).join(', ')}`,
      );
    }

    const h2Order = presentH2s.every((req, i) => {
      const posReq = findRequiredPosition(normalizedH2Texts, req);
      if (i === 0) return true;
      const prevReq = presentH2s[i - 1];
      const posPrev = findRequiredPosition(normalizedH2Texts, prevReq);
      return posReq > posPrev;
    });

    if (h2Order) {
      structure += 10;
    } else {
      issues.push('Ordem dos H2 nao corresponde ao template');
    }

    let seo = 0;
    const kwLower = mainKeyword.toLowerCase();
    const h1Text = h1?.text.toLowerCase() ?? '';

    if (h1Text.includes(kwLower)) {
      seo += 20;
    } else {
      issues.push(`Palavra-chave "${mainKeyword}" ausente no H1`);
    }

    const h2WithKw = h2Texts.filter((text) =>
      text.toLowerCase().includes(kwLower),
    );
    if (h2WithKw.length >= 2) {
      seo += 10;
    } else if (h2WithKw.length === 1) {
      seo += 5;
      issues.push('Palavra-chave presente em apenas 1 H2 (minimo: 2)');
    } else {
      issues.push('Palavra-chave ausente nos H2s');
    }

    const bodyText = root.text.toLowerCase();
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
      issues.push('Existem placeholders {{...}} nao preenchidos');
    }

    const score = Math.min(100, structure + seo + content);

    return {
      score,
      issues,
      breakdown: { structure, seo, content },
    };
  }
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function requiredOptions(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

function requiredLabel(value: string | string[]): string {
  return Array.isArray(value) ? value.join(' ou ') : value;
}

function findRequiredPosition(
  normalizedH2Texts: string[],
  required: string | string[],
): number {
  return normalizedH2Texts.findIndex((text) =>
    requiredOptions(required).some((option) =>
      text.includes(normalizeText(option)),
    ),
  );
}
