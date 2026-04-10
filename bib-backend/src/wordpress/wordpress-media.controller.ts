import { Controller, Get, Query } from '@nestjs/common';
import { WordPressService } from './wordpress.service';

@Controller('wordpress')
export class WordPressMediaController {
  constructor(private readonly wordPressService: WordPressService) {}

  @Get('media')
  listMedia(
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('search') search?: string,
  ) {
    return this.wordPressService.listMedia(
      type ?? 'image',
      Number(page) || 1,
      search ?? '',
    );
  }
}
