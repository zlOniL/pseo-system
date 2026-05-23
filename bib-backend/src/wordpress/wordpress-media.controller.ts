import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { WordPressService } from './wordpress.service';

@Controller('wordpress')
export class WordPressMediaController {
  constructor(private readonly wordPressService: WordPressService) {}

  @Get('media')
  listMedia(
    @Query('site_id') siteId?: string,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
  ) {
    if (!siteId) {
      throw new BadRequestException('site_id is required');
    }
    return this.wordPressService.listMedia(
      siteId,
      type ?? 'image',
      Number(page) || 1,
      search ?? '',
    );
  }
}
