import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService, QueueItem } from './queue.service';
import { ServicesService } from '../services/services.service';
import { GenerationService } from '../generation/generation.service';
import { TemplateEngineService } from '../template-engine/template-engine.service';
import { SectionAssemblerService } from '../service-templates/section-assembler.service';
import { ServiceTemplatesService } from '../service-templates/service-templates.service';
import { ContentsService } from '../contents/contents.service';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);
  private isRunning = false;

  private readonly concurrency = {
    ai: parseInt(process.env.QUEUE_CONCURRENCY_AI ?? '1'),
    template: parseInt(process.env.QUEUE_CONCURRENCY_TEMPLATE ?? '8'),
    library: parseInt(process.env.QUEUE_CONCURRENCY_LIBRARY ?? '10'),
  };

  constructor(
    private readonly queue: QueueService,
    private readonly services: ServicesService,
    private readonly generation: GenerationService,
    private readonly templateEngine: TemplateEngineService,
    private readonly assembler: SectionAssemblerService,
    private readonly serviceTemplates: ServiceTemplatesService,
    private readonly contents: ContentsService,
  ) {}

  onModuleInit() {
    void this.queue.resetStuckProcessing().then(() => {
      void this.processQueue();
    });
  }

  async processQueue(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    const spawn = (mode: 'ai' | 'template' | 'library', n: number) =>
      Array.from({ length: n }, () => this.runWorkerLoop(mode));

    try {
      await Promise.all([
        ...spawn('ai', this.concurrency.ai),
        ...spawn('template', this.concurrency.template),
        ...spawn('library', this.concurrency.library),
      ]);
    } finally {
      this.isRunning = false;
      this.logger.log('Queue vazia — todos os workers terminaram.');
    }
  }

  private async runWorkerLoop(mode: 'ai' | 'template' | 'library'): Promise<void> {
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

  private async processItem(item: QueueItem): Promise<void> {
    const mode = item.mode ?? 'ai';
    try {
      const service = await this.services.findById(item.service_id);
      const mainKeyword = `${service.name} em ${item.city}`;

      this.logger.log(`Processing [${mode}]: ${mainKeyword}`);

      const existing = await this.contents.findByServiceAndCity(service.id, item.city);
      for (const old of existing) {
        await this.contents.forceDelete(old.id);
        this.logger.log(`Deleted old content ${old.id} for ${item.city} (status: ${old.status})`);
      }

      let content;

      if (mode === 'library') {
        content = await this.assembler.assemble({ service, city: item.city, serviceId: service.id });
      } else if (mode === 'template') {
        const templateHtml = item.template_id
          ? (await this.serviceTemplates.findById(item.template_id)).html
          : undefined;
        content = await this.templateEngine.generate({ service, city: item.city, templateHtml });
      } else {
        content = await this.generation.generate({
          main_keyword: mainKeyword,
          service: service.name,
          city: item.city,
          video_url: service.video_url ?? undefined,
          images: service.images.length ? service.images : undefined,
          related_services: service.related_services.length
            ? service.related_services
            : undefined,
          service_notes: service.service_notes ?? undefined,
          tone: service.tone ?? undefined,
          min_words: service.min_words,
          service_id: service.id,
        });
      }

      await this.queue.markDone(item.id, content.id);
      this.logger.log(`Done: ${mainKeyword} → content ${content.id}`);
    } catch (err) {
      const msg = (err as Error).message;
      await this.queue.markFailed(item.id, msg);
      this.logger.error(`Failed [${item.city}]: ${msg}`);
    }
  }
}
