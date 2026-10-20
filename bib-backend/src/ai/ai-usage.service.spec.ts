import { SupabaseService } from '../common/supabase.service';
import { AiUsageService } from './ai-usage.service';

describe('AiUsageService', () => {
  it('prices cached input at the configured discounted rate', () => {
    const service = new AiUsageService({} as SupabaseService);
    const estimate = (
      service as unknown as {
        estimateCost: (event: {
          inputTokens: number;
          outputTokens: number;
          cachedTokens: number;
        }) => { cost: number; cacheSavings: number };
      }
    ).estimateCost({
      inputTokens: 1_000,
      cachedTokens: 900,
      outputTokens: 200,
    });

    expect(estimate.cost).toBeCloseTo(0.0000348, 10);
    expect(estimate.cacheSavings).toBeCloseTo(0.0000324, 10);
  });

  it('keeps one cache session and persists the run summary on its content', async () => {
    const events: Array<Record<string, unknown>> = [];
    const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
    const client = {
      from: (table: string) => ({
        insert: async (values: Record<string, unknown>) => {
          if (table === 'ai_usage_events') events.push(values);
          return { error: null };
        },
        select: () => ({
          eq: async () => ({ data: events, error: null }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push({ table, values });
            return { error: null };
          },
        }),
      }),
    };
    const service = new AiUsageService({ getClient: () => client } as never);

    const summary = await service.run(
      { kind: 'page', cacheScope: { site: 'site-1', service: 'service-1' } },
      async (runId) => {
        const sessionId = service.sessionIdForCurrentRun();
        expect(sessionId).toMatch(/^bib-page-/);
        await service.record({
          model: 'deepseek/deepseek-v4-flash',
          inputTokens: 1_000,
          outputTokens: 200,
          reasoningTokens: 0,
          cachedTokens: 900,
          cacheWriteTokens: 0,
          durationMs: 50,
        });
        return service.completeForContent(runId, 'content-1');
      },
    );

    expect(events[0]).toEqual(
      expect.objectContaining({ cached_tokens: 900, session_id: expect.any(String) }),
    );
    expect(summary).toMatchObject({ calls: 1, cacheHitRate: 0.9 });
    expect(updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'contents',
          values: expect.objectContaining({ ai_call_count: 1 }),
        }),
      ]),
    );
  });
});
