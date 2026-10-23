import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService, QueueItem } from './queue.service';
import { ServicesService, Service } from '../services/services.service';
import { GenerationService } from '../generation/generation.service';
import { TemplateEngineService } from '../template-engine/template-engine.service';
import { SectionAssemblerService } from '../service-templates/section-assembler.service';
import { ServiceTemplatesService } from '../service-templates/service-templates.service';
import { Content, ContentsService } from '../contents/contents.service';
import { SitesService } from '../sites/sites.service';
import { buildLocalKeyword } from '../common/location-preposition';
import { ServiceTemplatesController } from '../service-templates/service-templates.controller';
import { AiUsageService } from '../ai/ai-usage.service';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);
  private isRunning = false;
  private rerunRequested = false;

  private readonly concurrency = {
    ai: parseInt(process.env.QUEUE_CONCURRENCY_AI ?? '1'),
    template: parseInt(process.env.QUEUE_CONCURRENCY_TEMPLATE ?? '8'),
    library: parseInt(process.env.QUEUE_CONCURRENCY_LIBRARY ?? '10'),
    hybrid: Math.max(1, Number(process.env.QUEUE_CONCURRENCY_HYBRID) || 1),
    templateGeneration: 1,
  };

  constructor(
    private readonly queue: QueueService,
    private readonly services: ServicesService,
    private readonly generation: GenerationService,
    private readonly templateEngine: TemplateEngineService,
    private readonly assembler: SectionAssemblerService,
    private readonly serviceTemplates: ServiceTemplatesService,
    private readonly contents: ContentsService,
    private readonly sites: SitesService,
    private readonly templateGeneration: ServiceTemplatesController,
    private readonly aiUsage: AiUsageService,
  ) {}

  onModuleInit() {
    if (!this.isEnabled()) {
      this.logger.log('Queue worker disabled by QUEUE_WORKER_ENABLED.');
      return;
    }

    void this.queue.recoverStuckProcessing().then(() => {
      void this.processQueue();
    });
  }

  async processQueue(): Promise<void> {
    if (!this.isEnabled()) return;
    if (this.isRunning) {
      this.rerunRequested = true;
      return;
    }
    this.isRunning = true;

    const spawn = (mode: 'ai' | 'template' | 'library' | 'hybrid', n: number) =>
      Array.from({ length: n }, () => this.runWorkerLoop(mode));

    try {
      do {
        this.rerunRequested = false;
        await Promise.all([
          ...spawn('ai', this.concurrency.ai),
          ...spawn('template', this.concurrency.template),
          ...spawn('library', this.concurrency.library),
          ...spawn('hybrid', this.concurrency.hybrid),
          ...Array.from({ length: this.concurrency.templateGeneration }, () =>
            this.runTemplateGenerationLoop(),
          ),
        ]);
      } while (this.rerunRequested);
    } finally {
      this.isRunning = false;
      this.logger.log('Queue vazia — todos os workers terminaram.');
    }
  }

  private async runWorkerLoop(
    mode: 'ai' | 'template' | 'library' | 'hybrid',
  ): Promise<void> {
    while (true) {
      const item = await this.queue.pickAndClaim(mode);
      if (!item) {
        if (!(await this.queue.hasPending(mode))) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      await this.processItem(item);
    }
  }

  private async runTemplateGenerationLoop(): Promise<void> {
    while (true) {
      const item = await this.queue.pickAndClaim('ai', 'template');
      if (!item) {
        if (!(await this.queue.hasPending(undefined, 'template'))) break;
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      await this.processTemplateItem(item);
    }
  }

  private async processTemplateItem(item: QueueItem): Promise<void> {
    const startedAt = Date.now();
    try {
      const payload = item.payload;
      if (!payload) throw new Error('Job de template sem payload.');
      const result = await this.templateGeneration.generateQueued(
        item.service_id,
        payload,
        item.template_id ?? undefined,
        { jobId: item.id, claimToken: item.claim_token! },
      );
      await this.queue.markDone(item.id, result.content.id, item.claim_token!, result.template.id);
      this.logger.log(
        `[PERF] template_job_done id=${item.id} template=${result.template.id} duration_ms=${Date.now() - startedAt}`,
      );
    } catch (err) {
      const msg = this.userFacingError(err);
      await this.queue.markFailed(item.id, msg, item.claim_token!);
      this.logger.error(
        `[PERF] template_job_failed id=${item.id} duration_ms=${Date.now() - startedAt} error=${msg}`,
      );
    }
  }

  private async processItem(item: QueueItem): Promise<void> {
    const mode = item.mode ?? 'ai';
    const startedAt = Date.now();
    this.logger.log(
      `[PERF] queue_item_start id=${item.id} mode=${mode} city=${item.city}`,
    );
    try {
      const city = item.city;
      if (!city) throw new Error('Job de pagina sem cidade.');
      const service = await this.services.findById(item.service_id);
      const mainKeyword = buildLocalKeyword(service.name, city);
      const site = service.site_id
        ? await this.sites.findById(service.site_id)
        : null;

      this.logger.log(`Processing [${mode}]: ${mainKeyword}`);

      const existing = await this.contents.findByServiceAndCity(
        service.id,
        city,
      );

      // A published page is already the final result for this locality.
      // Keep it intact if the city is accidentally queued again.
      const published = existing.find(
        (content) => content.status === 'published',
      );
      if (published && !item.payload?.recreate) {
        await this.queue.markDone(item.id, published.id, item.claim_token!);
        this.logger.log(
          `Skipped regeneration for published content ${published.id} at ${city}`,
        );
        return;
      }

      const content = await this.aiUsage.withQueueClaim(
        { jobId: item.id, claimToken: item.claim_token! },
        () => this.generateContentForItem(
          item, mode, service, mainKeyword,
          site?.integration_type === 'whitelabel_api',
        ),
      );

      if (!(await this.queue.heartbeat(item.id, item.claim_token!))) {
        throw new Error('O job foi retomado por outro worker antes de concluir.');
      }

      for (const old of existing) {
        await this.contents.forceDelete(old.id);
        this.logger.log(
          `Deleted old content ${old.id} for ${city} (status: ${old.status})`,
        );
      }

      await this.queue.markDone(item.id, content.id, item.claim_token!);
      this.logger.log(
        `[PERF] queue_item_done id=${item.id} mode=${mode} city=${item.city} content=${content.id} duration_ms=${Date.now() - startedAt}`,
      );
    } catch (err) {
      const msg = this.userFacingError(err);
      await this.queue.markFailed(item.id, msg, item.claim_token!);
      this.logger.error(
        `[PERF] queue_item_failed id=${item.id} mode=${mode} city=${item.city} duration_ms=${Date.now() - startedAt} error=${msg}`,
      );
    }
  }

  private async generateContentForItem(
    item: QueueItem,
    mode: 'ai' | 'template' | 'library' | 'hybrid',
    service: Service,
    mainKeyword: string,
    isWhitelabelApiSite: boolean,
  ): Promise<Content> {
    if (
      mode === 'hybrid' ||
      mode === 'library' ||
      (mode === 'template' && isWhitelabelApiSite)
    ) {
      return this.assembler.assemble({
        service,
        city: item.city!,
        serviceId: service.id,
        mode: mode === 'hybrid' ? 'hybrid' : 'library',
        hybridState: item.hybrid_state ?? undefined,
        checkpoint:
          mode === 'hybrid'
            ? (state) => this.queue.saveHybridState(item.id, state)
            : undefined,
      });
    }

    if (mode === 'template') {
      const templateHtml = item.template_id
        ? ((await this.serviceTemplates.findById(item.template_id)).html ??
          undefined)
        : undefined;

      return this.templateEngine.generate({
        service,
        city: item.city!,
        templateHtml,
      });
    }

    return this.generation.generate({
      main_keyword: mainKeyword,
      service: service.name,
      city: item.city!,
      video_url: service.video_url ?? undefined,
      images: service.images.length ? service.images : undefined,
      related_services: service.related_services.length
        ? service.related_services
        : undefined,
      service_notes: service.service_notes ?? undefined,
      tone: service.tone ?? undefined,
      min_words: service.min_words,
      service_id: service.id,
      site_id: service.site_id ?? undefined,
    });
  }

  private isEnabled(): boolean {
    return process.env.QUEUE_WORKER_ENABLED !== 'false';
  }

  private userFacingError(err: unknown): string {
    const message = (err as Error).message || String(err);
    if (/fetch failed/i.test(message)) {
      return 'Falha de conexao com uma API externa. Tente novamente; se persistir, verifique rede, dominio do site e chaves configuradas.';
    }
    return message;
  }
}
