import { Injectable, Logger } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PromptContext,
  ResolvePromptContextInput,
} from './prompt-context.types';
import { resolveServicePromptSlug } from './service-prompt-resolver';

@Injectable()
export class PromptContextService {
  private readonly logger = new Logger(PromptContextService.name);
  private readonly fileCache = new Map<string, string | null>();
  private promptsDir: string | null = null;

  resolve(input: ResolvePromptContextInput): PromptContext {
    const warnings: string[] = [];
    const promptsDir = this.getPromptsDir();

    const guardrailPrompt = promptsDir
      ? this.readPromptFile(
          resolve(promptsDir, 'instrucoes-gerais-sobre-criacao-de-paginas.md'),
        )
      : null;

    if (!guardrailPrompt) {
      warnings.push('Prompt guardrail geral nao encontrado.');
    }

    const servicePromptSlug = resolveServicePromptSlug(input.service);
    const serviceExamplePrompt = promptsDir
      ? this.readPromptFile(
          resolve(promptsDir, `pagina-exemplo-${servicePromptSlug}.md`),
        )
      : null;

    if (!serviceExamplePrompt) {
      warnings.push(
        `Prompt exemplo do servico nao encontrado para slug "${servicePromptSlug}".`,
      );
    }

    for (const warning of warnings) {
      this.logger.warn(warning);
    }

    return {
      guardrailPrompt,
      serviceExamplePrompt,
      servicePromptSlug,
      warnings,
    };
  }

  private getPromptsDir(): string | null {
    if (this.promptsDir) return this.promptsDir;

    const candidates = [
      resolve(process.cwd(), 'prompts'),
      resolve(process.cwd(), '..', 'prompts'),
      resolve(__dirname, '..', '..', '..', 'prompts'),
    ];

    this.promptsDir = candidates.find((candidate) => existsSync(candidate)) ?? null;
    if (!this.promptsDir) {
      this.logger.warn(
        `Diretorio de prompts nao encontrado. Candidatos: ${candidates.join(', ')}`,
      );
    }
    return this.promptsDir;
  }

  private readPromptFile(filePath: string): string | null {
    if (this.fileCache.has(filePath)) {
      return this.fileCache.get(filePath) ?? null;
    }

    if (!existsSync(filePath)) {
      this.fileCache.set(filePath, null);
      return null;
    }

    const content = readFileSync(filePath, 'utf8').trim();
    this.fileCache.set(filePath, content);
    return content;
  }
}
