import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

class RateLimitError extends Error {}
class TransientAiError extends Error {}

type OpenRouterResponse = {
  choices?: Array<{
    finish_reason?: string;
    native_finish_reason?: string;
    message?: {
      content?: string;
    };
  }>;
};

type OpenRouterProviderRouting = {
  order: string[];
  allow_fallbacks: boolean;
};

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly openRouterUrl =
    'https://openrouter.ai/api/v1/chat/completions';
  private readonly exhaustedUntil = new Map<string, number>();

  private getModels(): string[] {
    const list = process.env.OPENROUTER_MODELS;
    if (list) {
      return list
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
    }

    return ['openrouter/owl-alpha'];
  }

  private getMaxTokens(): number {
    const value = Number(process.env.OPENROUTER_MAX_TOKENS);
    return Number.isFinite(value) && value > 0 ? value : 65536;
  }

  private getProviderRouting(model: string): OpenRouterProviderRouting | null {
    if (!model.toLowerCase().startsWith('deepseek/')) {
      return null;
    }

    return {
      order: ['deepseek', 'deepinfra'],
      allow_fallbacks: true,
    };
  }

  private isExhausted(model: string): boolean {
    const until = this.exhaustedUntil.get(model);
    return until !== undefined && Date.now() < until;
  }

  private markExhausted(model: string): void {
    const now = new Date();
    const midnight = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
    );
    this.exhaustedUntil.set(model, midnight.getTime());
    this.logger.warn(
      `Model ${model} rate-limited - suspended until ${midnight.toISOString()}`,
    );
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    if (!process.env.OPENROUTER_KEY) {
      throw new ServiceUnavailableException(
        'OPENROUTER_KEY nao configurada no backend',
      );
    }

    const available = this.getModels().filter((m) => !this.isExhausted(m));

    if (available.length === 0) {
      throw new ServiceUnavailableException(
        'Todos os modelos de IA esgotados para hoje',
      );
    }

    for (const model of available) {
      try {
        return await this.tryModel(model, systemPrompt, userPrompt);
      } catch (err) {
        if (err instanceof RateLimitError) {
          this.markExhausted(model);
          continue;
        }
        if (err instanceof TransientAiError) {
          this.logger.warn(
            `Modelo ${model} falhou temporariamente; tentando proximo modelo se existir.`,
          );
          continue;
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException(
      'Todos os modelos de IA disponiveis falharam temporariamente',
    );
  }

  async callOpenRouter(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    return this.generateText(systemPrompt, userPrompt);
  }

  private async tryModel(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    this.logger.log(`Calling OpenRouter model: ${model}`);
    const provider = this.getProviderRouting(model);

    const response = await this.fetchWithTransientRetry(
      this.openRouterUrl,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: this.getMaxTokens(),
          ...(provider ? { provider } : {}),
        }),
      },
      model,
    );

    if (response.status === 429) {
      const body = await response.text();
      this.logger.warn(`Rate limit em ${model}: ${body}`);
      throw new RateLimitError();
    }

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(
        `OpenRouter error ${response.status} (${model}): ${error}`,
      );
      if (response.status >= 500 || response.status === 408) {
        throw new TransientAiError(this.compactError(error));
      }
      if (response.status === 401 || response.status === 403) {
        throw new BadRequestException(
          `OpenRouter ${response.status}: verifique a OPENROUTER_KEY e as permissoes da conta`,
        );
      }
      throw new BadRequestException(
        `OpenRouter ${response.status}: ${this.compactError(error)}`,
      );
    }

    const data = (await response.json()) as OpenRouterResponse;
    const choice = data.choices?.[0];
    const content = choice?.message?.content ?? '';

    if (!content.trim()) {
      throw new BadRequestException('OpenRouter retornou uma resposta vazia');
    }

    if (choice?.finish_reason === 'length') {
      this.logger.warn(
        `OpenRouter truncated output for ${model}: finish_reason=length native_finish_reason=${choice.native_finish_reason ?? 'unknown'}`,
      );
    }

    return this.stripMarkdown(content);
  }

  private async fetchWithTransientRetry(
    url: string,
    init: RequestInit,
    model: string,
  ): Promise<Response> {
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch(url, init);
      if (
        ![408, 500, 502, 503, 504].includes(response.status) ||
        attempt === maxAttempts
      ) {
        return response;
      }
      const body = await response.text();
      this.logger.warn(
        `OpenRouter transient ${response.status} (${model}) attempt ${attempt}/${maxAttempts}: ${this.compactError(body)}`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
    return fetch(url, init);
  }

  private compactError(error: string): string {
    return error.replace(/\s+/g, ' ').trim().slice(0, 1200);
  }

  private stripMarkdown(raw: string): string {
    return raw
      .replace(/^```[a-z0-9_-]*\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
}
