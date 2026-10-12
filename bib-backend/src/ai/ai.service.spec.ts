import { AiService } from './ai.service';

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
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
