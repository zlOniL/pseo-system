import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { ContentsService, Content } from '../contents/contents.service';
import { BulkActionDto } from '../contents/dto/bulk-action.dto';

@Controller('contents')
export class WordPressController {
  constructor(
    private readonly wordPressService: WordPressService,
    private readonly contentsService: ContentsService,
  ) {}

  @Post('bulk-approve')
  @HttpCode(200)
  bulkApprove(@Body() dto: BulkActionDto) {
    return this.contentsService.bulkUpdateStatus(dto.ids, 'approved');
  }

  @Post('bulk-publish')
  @HttpCode(200)
  async bulkPublish(@Body() dto: BulkActionDto) {
    const results: Array<{ id: string; success: boolean; data?: Content; error?: string }> = [];
    for (const id of dto.ids) {
      try {
        const data = await this.wordPressService.publish(id);
        results.push({ id, success: true, data });
      } catch (err) {
        results.push({ id, success: false, error: (err as Error).message });
      }
    }
    return results;
  }

  @Post('bulk-delete')
  @HttpCode(200)
  bulkDelete(@Body() dto: BulkActionDto) {
    return this.contentsService.bulkDelete(dto.ids);
  }

  @Post(':id/publish')
  @HttpCode(200)
  publish(@Param('id') id: string) {
    return this.wordPressService.publish(id);
  }
}
