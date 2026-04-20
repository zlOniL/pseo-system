import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { WordPressService } from './wordpress.service';
import { ContentsService } from '../contents/contents.service';
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
  bulkPublish(@Body() dto: BulkActionDto) {
    return this.wordPressService.bulkPublish(dto.ids);
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
