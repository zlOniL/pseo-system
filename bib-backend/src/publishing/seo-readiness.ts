import { BadRequestException } from '@nestjs/common';
import { Content } from '../contents/contents.service';

export function assertSeoReadyForApproval(content: Content): void {
  const issues = content.score_issues ?? [];
  const blockers = issues.filter((issue) => issue.startsWith('[BLOQUEIO]'));
  const scoreIssue =
    typeof content.score === 'number' && content.score < 70
      ? [`score ${content.score} abaixo do minimo 70`]
      : [];
  if (blockers.length || scoreIssue.length) {
    throw new BadRequestException(
      `Conteudo nao pode ser aprovado/publicado: ${[...blockers, ...scoreIssue].join('; ')}`,
    );
  }
}
