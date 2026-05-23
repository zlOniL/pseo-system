import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';

class RateLimitError extends Error {}
class TransientAiError extends Error {}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly exhaustedUntil = new Map<string, number>();

  private getModels(): string[] {
    const list = process.env.GOOGLE_AI_MODELS;
    if (list)
      return list
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean);
    return [process.env.GOOGLE_AI_MODEL ?? 'gemini-2.0-flash'];
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
      `Model ${model} rate-limited — suspenso até ${midnight.toISOString()}`,
    );
  }

  async callOpenRouter(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
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

  private async tryModel(
    model: string,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    const url =
      'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    this.logger.log(`Calling Google AI Studio model: ${model}`);

    const response = await this.fetchWithTransientRetry(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.GOOGLE_AI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 65536,
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
        `Google AI Studio error ${response.status} (${model}): ${error}`,
      );
      if (response.status >= 500 || response.status === 408) {
        throw new TransientAiError(this.compactError(error));
      }
      throw new BadRequestException(
        `Google AI Studio ${response.status}: ${this.compactError(error)}`,
      );
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return this.stripMarkdown(data.choices?.[0]?.message?.content ?? '');
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
        `Google AI Studio transient ${response.status} (${model}) attempt ${attempt}/${maxAttempts}: ${this.compactError(body)}`,
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
