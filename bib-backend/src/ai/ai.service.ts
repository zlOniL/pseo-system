import { Injectable, InternalServerErrorException, Logger, ServiceUnavailableException } from '@nestjs/common';

class RateLimitError extends Error {}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly exhaustedUntil = new Map<string, number>();

  private getModels(): string[] {
    const list = process.env.GOOGLE_AI_MODELS;
    if (list) return list.split(',').map((m) => m.trim()).filter(Boolean);
    return [process.env.GOOGLE_AI_MODEL ?? 'gemini-2.0-flash'];
  }

  private isExhausted(model: string): boolean {
    const until = this.exhaustedUntil.get(model);
    return until !== undefined && Date.now() < until;
  }

  private markExhausted(model: string): void {
    const now = new Date();
    const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    this.exhaustedUntil.set(model, midnight.getTime());
    this.logger.warn(`Model ${model} rate-limited — suspenso até ${midnight.toISOString()}`);
  }

  async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
    const available = this.getModels().filter((m) => !this.isExhausted(m));

    if (available.length === 0) {
      throw new ServiceUnavailableException('Todos os modelos de IA esgotados para hoje');
    }

    for (const model of available) {
      try {
        return await this.tryModel(model, systemPrompt, userPrompt);
      } catch (err) {
        if (err instanceof RateLimitError) {
          this.markExhausted(model);
          continue;
        }
        throw err;
      }
    }

    throw new ServiceUnavailableException('Todos os modelos de IA esgotados para hoje');
  }

  private async tryModel(model: string, systemPrompt: string, userPrompt: string): Promise<string> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
    this.logger.log(`Calling Google AI Studio model: ${model}`);

    const response = await fetch(url, {
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
    });

    if (response.status === 429) {
      const body = await response.text();
      this.logger.warn(`Rate limit em ${model}: ${body}`);
      throw new RateLimitError();
    }

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Google AI Studio error ${response.status} (${model}): ${error}`);
      throw new InternalServerErrorException('AI service error');
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    return this.stripMarkdown(data.choices?.[0]?.message?.content ?? '');
  }

  private stripMarkdown(raw: string): string {
    return raw
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
}
