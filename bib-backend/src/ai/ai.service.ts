import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  async callOpenRouter(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = process.env.GOOGLE_AI_MODEL ?? 'gemini-2.0-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;

    const body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 65536,
    };

    this.logger.log(`Calling Google AI Studio model: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GOOGLE_AI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Google AI Studio error ${response.status}: ${error}`);
      throw new InternalServerErrorException('AI service error');
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[];
    };

    const rawContent = data.choices?.[0]?.message?.content ?? '';

    // Strip markdown code fences if model wraps HTML in ```html ... ```
    return this.stripMarkdown(rawContent);
  }

  private stripMarkdown(raw: string): string {
    return raw
      .replace(/^```(?:html)?\s*/i, '')
      .replace(/\s*```\s*$/, '')
      .trim();
  }
}
