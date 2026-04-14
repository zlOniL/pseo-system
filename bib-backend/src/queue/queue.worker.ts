import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QueueService } from './queue.service';
import { ServicesService } from '../services/services.service';
import { GenerationService } from '../generation/generation.service';
import { TemplateEngineService } from '../template-engine/template-engine.service';
import { ContentsService } from '../contents/contents.service';

@Injectable()
export class QueueWorker implements OnModuleInit {
  private readonly logger = new Logger(QueueWorker.name);
  private isProcessing = false;

  constructor(
    private readonly queue: QueueService,
    private readonly services: ServicesService,
    private readonly generation: GenerationService,
    private readonly templateEngine: TemplateEngineService,
    private readonly contents: ContentsService,
  ) {}

  onModuleInit() {
    // Reset any items stuck as 'processing' from a previous crashed run
    void this.queue.resetStuckProcessing().then(() => {
      void this.processQueue();
    });
  }

  async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (true) {
        const item = await this.queue.pickNext();
        if (!item) break;

        try {
          await this.queue.markProcessing(item.id);

          const service = await this.services.findById(item.service_id);
          const mainKeyword = `${service.name} em ${item.city}`;
          const mode = item.mode ?? 'ai';

          this.logger.log(`Processing [${mode}]: ${mainKeyword}`);

          // Delete any existing content for this service+city before regenerating
          const existing = await this.contents.findByServiceAndCity(service.id, item.city);
          for (const old of existing) {
            await this.contents.forceDelete(old.id);
            this.logger.log(`Deleted old content ${old.id} for ${item.city} (status: ${old.status})`);
          }

          let content;

          if (mode === 'template') {
            content = await this.templateEngine.generate({ service, city: item.city });
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
    } finally {
      this.isProcessing = false;
      this.logger.log('Queue empty — worker stopped.');
    }
  }
}
