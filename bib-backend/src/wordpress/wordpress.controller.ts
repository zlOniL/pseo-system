import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ContentsService } from '../contents/contents.service';
import { BulkActionDto } from '../contents/dto/bulk-action.dto';
import { PublishingService } from '../publishing/publishing.service';
import { assertSeoReadyForApproval } from '../publishing/seo-readiness';

@Controller('contents')
export class WordPressController {
  constructor(
    private readonly publishingService: PublishingService,
    private readonly contentsService: ContentsService,
  ) {}

  @Post('bulk-approve')
  @HttpCode(200)
  async bulkApprove(@Body() dto: BulkActionDto) {
    const contents = await this.contentsService.findByIds(dto.ids);
    for (const content of contents) assertSeoReadyForApproval(content);
    return this.contentsService.bulkUpdateStatus(dto.ids, 'approved');
  }

  @Post('bulk-publish')
  @HttpCode(200)
  async bulkPublish(@Body() dto: BulkActionDto) {
    return this.publishingService.bulkPublish(dto.ids);
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body() dto: BulkActionDto) {
    return this.contentsService.bulkDelete(dto.ids);
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @Body() dto: { forceRemoteConflict?: boolean } = {},
  ) {
    return this.publishingService.publish(id, {
      forceRemoteConflict: dto.forceRemoteConflict === true,
    });
  }
}
