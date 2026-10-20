import { AiService } from './ai.service';
import { AiUsageService } from './ai-usage.service';

describe('AiService', () => {
  const originalKey = process.env.OPENROUTER_KEY;
  const originalModels = process.env.OPENROUTER_MODELS;
  const originalTimeout = process.env.OPENROUTER_TIMEOUT_MS;

  afterEach(() => {
    jest.restoreAllMocks();
    restoreEnv('OPENROUTER_KEY', originalKey);
    restoreEnv('OPENROUTER_MODELS', originalModels);
    restoreEnv('OPENROUTER_TIMEOUT_MS', originalTimeout);
  });

  it('applies the configured timeout to every OpenRouter request', async () => {
    process.env.OPENROUTER_KEY = 'test-key';
    process.env.OPENROUTER_MODELS = 'test/model';
    process.env.OPENROUTER_TIMEOUT_MS = '25000';
    const signal = new AbortController().signal;
    const timeout = jest.spyOn(AbortSignal, 'timeout').mockReturnValue(signal);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: 'resultado' } }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(new AiService().generateText('system', 'user')).resolves.toBe(
      'resultado',
    );

    expect(timeout).toHaveBeenCalledWith(25_000);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal }),
    );
  });

  it('retries when the timeout happens while reading the response body', async () => {
    process.env.OPENROUTER_KEY = 'test-key';
    process.env.OPENROUTER_MODELS = 'test/model';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce({
        status: 200,
        text: jest.fn().mockRejectedValue(new Error('body timed out')),
      } as unknown as Response)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'resultado' } }] }),
          { status: 200 },
        ),
      );

    await expect(new AiService().generateText('system', 'user')).resolves.toBe(
      'resultado',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('retries OpenRouter timeout status 524', async () => {
    process.env.OPENROUTER_KEY = 'test-key';
    process.env.OPENROUTER_MODELS = 'test/model';
    jest.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('upstream timeout', { status: 524 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'resultado' } }] }),
          { status: 200 },
        ),
      );

    await expect(new AiService().generateText('system', 'user')).resolves.toBe(
      'resultado',
    );

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('sends the cache session and records cached-token usage', async () => {
    process.env.OPENROUTER_KEY = 'test-key';
    process.env.OPENROUTER_MODELS = 'deepseek/deepseek-v4-flash';
    const usage = {
      sessionIdForCurrentRun: jest.fn().mockReturnValue('bib-page-cache-key'),
      record: jest.fn().mockResolvedValue(undefined),
    } as unknown as AiUsageService;
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'request-1',
          model: 'deepseek/deepseek-v4-flash',
          openrouter_metadata: { provider_name: 'DeepSeek' },
          choices: [{ message: { content: 'resultado' } }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 200,
            prompt_tokens_details: { cached_tokens: 900 },
          },
        }),
        { status: 200 },
      ),
    );

    await new AiService(usage).generateText('system', 'user', {
      operation: 'html_section',
      sectionKey: 'intro',
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(String(request.body))).toEqual(
      expect.objectContaining({ session_id: 'bib-page-cache-key' }),
    );
    expect(usage.record).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'html_section',
        sectionKey: 'intro',
        requestId: 'request-1',
        inputTokens: 1000,
        outputTokens: 200,
        cachedTokens: 900,
      }),
    );
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
