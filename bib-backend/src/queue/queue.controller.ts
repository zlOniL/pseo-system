import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { QueueService } from './queue.service';
import { QueueWorker } from './queue.worker';
import { EnqueueDto } from './dto/enqueue.dto';
import { BulkActionDto } from '../contents/dto/bulk-action.dto';

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly worker: QueueWorker,
  ) {}

  @Post('enqueue')
  @HttpCode(201)
  async enqueue(@Body() dto: EnqueueDto) {
    const items = await this.queueService.enqueue(
      dto.service_id,
      dto.cities,
      dto.mode ?? 'ai',
      dto.template_id,
    );
    // Fire-and-forget: activate the worker without blocking the HTTP response
    void this.worker.processQueue();
    return items;
  }

  @Get('stats')
  getStats(
    @Query('status') status?: string,
    @Query('site_id') site_id?: string,
    @Query('service_id') service_id?: string,
    @Query('mode') mode?: string,
    @Query('city') city?: string,
    @Query('cities') cities?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('has_error') has_error?: string,
  ) {
    return this.queueService.getStats({
      status,
      site_id,
      service_id,
      mode,
      city,
      cities,
      from,
      to,
      has_error: this.parseBoolean(has_error),
    });
  }

  @Get('service/:serviceId')
  findByService(@Param('serviceId') serviceId: string) {
    return this.queueService.findByService(serviceId);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('site_id') site_id?: string,
    @Query('service_id') service_id?: string,
    @Query('mode') mode?: string,
    @Query('city') city?: string,
    @Query('cities') cities?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('has_error') has_error?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.queueService.findAll(
      {
        status,
        site_id,
        service_id,
        mode,
        city,
        cities,
        from,
        to,
        has_error: this.parseBoolean(has_error),
      },
      {
        page: page ? Number(page) : undefined,
        limit: limit ? Number(limit) : undefined,
      },
    );
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.queueService.remove(id);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body() dto: BulkActionDto) {
    return this.queueService.bulkRemove(dto.ids);
  }

  @Post('bulk-retry')
  @HttpCode(200)
  bulkRetry(@Body() dto: BulkActionDto) {
    const items = this.queueService.bulkRetry(dto.ids);
    void this.worker.processQueue();
    return items;
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    const item = this.queueService.retry(id);
    void this.worker.processQueue();
    return item;
  }

  private parseBoolean(value?: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return undefined;
  }
}
