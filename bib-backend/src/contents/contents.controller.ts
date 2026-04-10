import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Patch } from '@nestjs/common';
import { ContentsService } from './contents.service';

@Controller('contents')
export class ContentsController {
  constructor(private readonly contentsService: ContentsService) {}

  @Get()
  findAll() {
    return this.contentsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.contentsService.findById(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: 'approved' | 'published',
  ) {
    return this.contentsService.updateStatus(id, status);
  }

  @Delete(':id')
  @HttpCode(204)
  async delete(@Param('id') id: string) {
    try {
      await this.contentsService.delete(id);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
