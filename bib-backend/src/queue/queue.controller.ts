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

@Controller('queue')
export class QueueController {
  constructor(
    private readonly queueService: QueueService,
    private readonly worker: QueueWorker,
  ) {}

  @Post('enqueue')
  @HttpCode(201)
  async enqueue(@Body() dto: EnqueueDto) {
    const items = await this.queueService.enqueue(dto.service_id, dto.cities);
    // Fire-and-forget: activate the worker without blocking the HTTP response
    void this.worker.processQueue();
    return items;
  }

  @Get('stats')
  getStats() {
    return this.queueService.getStats();
  }

  @Get('service/:serviceId')
  findByService(@Param('serviceId') serviceId: string) {
    return this.queueService.findByService(serviceId);
  }

  @Get()
  findAll(
    @Query('status') status?: string,
    @Query('service_id') service_id?: string,
  ) {
    return this.queueService.findAll({ status, service_id });
  }

  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string) {
    return this.queueService.remove(id);
  }

  @Post(':id/retry')
  @HttpCode(200)
  retry(@Param('id') id: string) {
    const item = this.queueService.retry(id);
    void this.worker.processQueue();
    return item;
  }
}
