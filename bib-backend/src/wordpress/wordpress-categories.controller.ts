import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { WordPressService } from './wordpress.service';

@Controller('wordpress')
export class WordPressCategoriesController {
  constructor(private readonly wordPressService: WordPressService) {}

  @Get('categories')
  getCategories(@Query('site_id') siteId?: string) {
    if (!siteId) throw new BadRequestException('site_id is required');
    return this.wordPressService.getCategories(siteId);
  }

  @Post('categories')
  @HttpCode(200)
  createCategory(
    @Body() body: { site_id?: string; name: string; parent?: string },
  ) {
    if (!body.site_id) throw new BadRequestException('site_id is required');
    return this.wordPressService.createCategory(
      body.site_id,
      body.name,
      body.parent ?? 'Blog',
    );
  }
}
