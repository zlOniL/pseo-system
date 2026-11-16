import { BadRequestException } from '@nestjs/common';
import { Content } from '../contents/contents.service';

export function assertSeoReadyForApproval(content: Content): void {
  const issues = content.score_issues ?? [];
  const advisoryPattern =
    /^\[BLOQUEIO\] (?:H[1-6]:|O H1|H[1-6] vazio|Hierarquia de headings|Existem placeholders)/;
  const blockers = issues.filter(
    (issue) => issue.startsWith('[BLOQUEIO]') && !advisoryPattern.test(issue),
  );
  if (blockers.length) {
    throw new BadRequestException(
      `Conteudo nao pode ser aprovado/publicado: ${blockers.join('; ')}`,
    );
  }
}
