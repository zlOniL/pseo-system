import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { SupabaseService } from '../common/supabase.service';

export type AiUsageCall = {
  operation?: string;
  sectionKey?: string;
  attempt?: number;
};

type AiUsageScope = {
  runId?: string;
  kind?: 'page' | 'template' | 'section';
  sessionId?: string;
  queueClaim?: { jobId: string; claimToken: string };
};

type AiUsageEvent = AiUsageCall & {
  model: string;
  provider?: string;
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  durationMs: number;
};

export type AiUsageSummary = {
  cost: number;
  cacheSavings: number;
  cacheHitRate: number;
  calls: number;
};

@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);
  private readonly storage = new AsyncLocalStorage<AiUsageScope>();
  private telemetryAvailable = true;

  constructor(private readonly supabase: SupabaseService) {}

  async run<T>(
    input: {
      kind: NonNullable<AiUsageScope['kind']>;
      cacheScope: unknown;
      queueClaim?: { jobId: string; claimToken: string };
    },
    work: (runId: string) => Promise<T>,
  ): Promise<T> {
    const runId = randomUUID();
    const sessionId = this.sessionId(input.kind, input.cacheScope);
    const scope: AiUsageScope = {
      ...this.storage.getStore(),
      runId,
      kind: input.kind,
      sessionId,
      queueClaim: input.queueClaim ?? this.storage.getStore()?.queueClaim,
    };

    await this.safeWrite(async () => {
      const { error } = await this.supabase.getClient().from('ai_runs').insert({
        id: runId,
        kind: input.kind,
        session_id: sessionId,
      });
      if (error) throw error;
    });

    try {
      return await this.storage.run(scope, () => work(runId));
    } catch (error) {
      await this.finish(runId, 'failed');
      throw error;
    }
  }

  sessionIdForCurrentRun(): string | undefined {
    return this.storage.getStore()?.sessionId;
  }

  async withQueueClaim<T>(
    queueClaim: { jobId: string; claimToken: string },
    work: () => Promise<T>,
  ): Promise<T> {
    return this.storage.run(
      { ...this.storage.getStore(), queueClaim },
      work,
    );
  }

  async reserveCurrentQueueCall(): Promise<void> {
    const claim = this.storage.getStore()?.queueClaim;
    if (!claim) return;
    const { data, error } = await this.supabase.getClient().rpc(
      'reserve_queue_ai_call',
      {
        p_queue_id: claim.jobId,
        p_claim_token: claim.claimToken,
        p_max_calls: 40,
      },
    );
    if (error) {
      throw new ServiceUnavailableException(
        `Nao foi possivel reservar o limite de IA da fila: ${error.message}`,
      );
    }
    if (data !== true) {
      throw new ServiceUnavailableException(
        'Limite de 40 chamadas de IA desta pagina atingido. Use Regenerar para iniciar uma nova tentativa.',
      );
    }
  }

  async record(event: AiUsageEvent): Promise<void> {
    const scope = this.storage.getStore();
    if (!scope?.runId) return;

    const cost = this.estimateCost(event);
    await this.safeWrite(async () => {
      const { error } = await this.supabase
        .getClient()
        .from('ai_usage_events')
        .insert({
          run_id: scope.runId,
          operation: event.operation ?? 'generation',
          section_key: event.sectionKey ?? null,
          attempt: event.attempt ?? null,
          model: event.model,
          provider: event.provider ?? null,
          request_id: event.requestId ?? null,
          session_id: scope.sessionId,
          input_tokens: event.inputTokens,
          output_tokens: event.outputTokens,
          reasoning_tokens: event.reasoningTokens,
          cached_tokens: event.cachedTokens,
          cache_write_tokens: event.cacheWriteTokens,
          estimated_cost_usd: cost.cost,
          estimated_cache_savings_usd: cost.cacheSavings,
          duration_ms: event.durationMs,
        });
      if (error) throw error;
    });
  }

  async completeForContent(
    runId: string,
    contentId: string,
  ): Promise<AiUsageSummary> {
    let summary: AiUsageSummary = {
      cost: 0,
      cacheSavings: 0,
      cacheHitRate: 0,
      calls: 0,
    };
    try {
      summary = await this.summaryForRun(runId);
    } catch (error) {
      this.logger.warn(`AI telemetry summary skipped: ${(error as Error).message}`);
    }
    await this.safeWrite(async () => {
      const client = this.supabase.getClient();
      const { error: runError } = await client
        .from('ai_runs')
        .update({ content_id: contentId, status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', runId);
      if (runError) throw runError;

      const { error: contentError } = await client
        .from('contents')
        .update({
          ai_last_run_id: runId,
          ai_cost_usd: summary.cost,
          ai_cache_savings_usd: summary.cacheSavings,
          ai_cache_hit_rate: summary.cacheHitRate,
          ai_call_count: summary.calls,
        })
        .eq('id', contentId);
      if (contentError) throw contentError;
    });
    return summary;
  }

  private async finish(runId: string, status: 'completed' | 'failed'): Promise<void> {
    await this.safeWrite(async () => {
      const { error } = await this.supabase
        .getClient()
        .from('ai_runs')
        .update({ status, completed_at: new Date().toISOString() })
        .eq('id', runId);
      if (error) throw error;
    });
  }

  private async summaryForRun(runId: string): Promise<AiUsageSummary> {
    const { data, error } = await this.supabase
      .getClient()
      .from('ai_usage_events')
      .select('input_tokens, cached_tokens, estimated_cost_usd, estimated_cache_savings_usd')
      .eq('run_id', runId);
    if (error) throw error;
    const events = data ?? [];
    const input = events.reduce((sum, event) => sum + Number(event.input_tokens ?? 0), 0);
    const cached = events.reduce((sum, event) => sum + Number(event.cached_tokens ?? 0), 0);
    return {
      cost: events.reduce((sum, event) => sum + Number(event.estimated_cost_usd ?? 0), 0),
      cacheSavings: events.reduce(
        (sum, event) => sum + Number(event.estimated_cache_savings_usd ?? 0),
        0,
      ),
      cacheHitRate: input ? cached / input : 0,
      calls: events.length,
    };
  }

  private estimateCost(event: AiUsageEvent): { cost: number; cacheSavings: number } {
    const inputRate = this.rate('OPENROUTER_INPUT_COST_PER_M', 0.04);
    const cachedRate = this.rate('OPENROUTER_CACHED_INPUT_COST_PER_M', 0.004);
    const outputRate = this.rate('OPENROUTER_OUTPUT_COST_PER_M', 0.136);
    const uncached = Math.max(0, event.inputTokens - event.cachedTokens);
    const cost =
      (uncached * inputRate + event.cachedTokens * cachedRate + event.outputTokens * outputRate) /
      1_000_000;
    return {
      cost,
      cacheSavings: (event.cachedTokens * (inputRate - cachedRate)) / 1_000_000,
    };
  }

  private rate(name: string, fallback: number): number {
    const configured = Number(process.env[name]);
    return Number.isFinite(configured) && configured >= 0 ? configured : fallback;
  }

  private sessionId(kind: string, cacheScope: unknown): string {
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ model: process.env.OPENROUTER_MODELS ?? '', kind, cacheScope }))
      .digest('hex')
      .slice(0, 40);
    return `bib-${kind}-${fingerprint}`;
  }

  private async safeWrite(work: () => Promise<void>): Promise<void> {
    if (!this.telemetryAvailable) return;
    try {
      await work();
    } catch (error) {
      this.telemetryAvailable = false;
      this.logger.warn(`AI telemetry skipped: ${(error as Error).message}`);
    }
  }
}
