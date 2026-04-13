import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { WordPressService } from './wordpress.service';

@Controller('wordpress')
export class WordPressCategoriesController {
  constructor(private readonly wordPressService: WordPressService) {}

  @Get('categories')
  getCategories() {
    return this.wordPressService.getCategories();
  }

  @Post('categories')
  @HttpCode(200)
  createCategory(@Body() body: { name: string; parent?: string }) {
    return this.wordPressService.createCategory(body.name, body.parent ?? 'Blog');
  }
}
