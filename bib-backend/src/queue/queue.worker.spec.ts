import { QueueWorker } from './queue.worker';

describe('QueueWorker', () => {
  const originalAiConcurrency = process.env.QUEUE_CONCURRENCY_AI;
  const originalTemplateConcurrency = process.env.QUEUE_CONCURRENCY_TEMPLATE;
  const originalLibraryConcurrency = process.env.QUEUE_CONCURRENCY_LIBRARY;

  beforeEach(() => {
    process.env.QUEUE_CONCURRENCY_AI = '1';
    process.env.QUEUE_CONCURRENCY_TEMPLATE = '1';
    process.env.QUEUE_CONCURRENCY_LIBRARY = '1';
  });

  afterEach(() => {
    restoreEnv('QUEUE_CONCURRENCY_AI', originalAiConcurrency);
    restoreEnv('QUEUE_CONCURRENCY_TEMPLATE', originalTemplateConcurrency);
    restoreEnv('QUEUE_CONCURRENCY_LIBRARY', originalLibraryConcurrency);
  });

  it('runs every mode again when new work arrives while another mode is active', async () => {
    const worker = new QueueWorker(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    let releaseTemplate!: () => void;
    const templateStarted = new Promise<void>((resolve) => {
      releaseTemplate = resolve;
    });
    let notifyTemplateStarted!: () => void;
    const templateEntered = new Promise<void>((resolve) => {
      notifyTemplateStarted = resolve;
    });
    const calls: string[] = [];

    jest
      .spyOn(worker as never, 'runWorkerLoop' as never)
      .mockImplementation(async (mode: 'ai' | 'template' | 'library') => {
        calls.push(mode);
        if (mode === 'template' && calls.filter((item) => item === mode).length === 1) {
          notifyTemplateStarted();
          await templateStarted;
        }
      });

    jest
      .spyOn(worker as never, 'runTemplateGenerationLoop' as never)
      .mockImplementation(async () => {
        calls.push('template-generation');
      });

    const processing = worker.processQueue();
    await templateEntered;
    await worker.processQueue();
    releaseTemplate();
    await processing;

    expect(calls.filter((mode) => mode === 'ai')).toHaveLength(2);
    expect(calls.filter((mode) => mode === 'template')).toHaveLength(2);
    expect(calls.filter((mode) => mode === 'library')).toHaveLength(2);
    expect(calls.filter((mode) => mode === 'template-generation')).toHaveLength(2);
  });
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
