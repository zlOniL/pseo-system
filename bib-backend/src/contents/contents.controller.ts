import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ContentsService } from './contents.service';
import { ListContentsDto } from './dto/list-contents.dto';
import { ContentSectionsService } from './content-sections.service';
import {
  SECTION_KEYS,
  SectionKey,
} from '../service-templates/service-templates.types';

@Controller('contents')
export class ContentsController {
  constructor(
    private readonly contentsService: ContentsService,
    private readonly contentSections: ContentSectionsService,
  ) {}

  @Get()
  findAll(@Query() dto: ListContentsDto) {
    return this.contentsService.findAll(dto);
  }

  @Get(':id/sections')
  findSections(@Param('id') id: string) {
    return this.contentSections.listByContentId(id);
  }

  @Patch(':id/sections/:sectionKey')
  updateSection(
    @Param('id') id: string,
    @Param('sectionKey') sectionKey: string,
    @Body() body: { html?: string; content_json?: unknown },
  ) {
    return this.contentSections.updateSection(
      id,
      this.parseSectionKey(sectionKey),
      body,
    );
  }

  @Post(':id/sections/:sectionKey/regenerate')
  regenerateSection(
    @Param('id') id: string,
    @Param('sectionKey') sectionKey: string,
    @Body('feedback') feedback?: string,
  ) {
    return this.contentSections.regenerateSection(
      id,
      this.parseSectionKey(sectionKey),
      feedback,
    );
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

  private parseSectionKey(sectionKey: string): SectionKey {
    if ((SECTION_KEYS as readonly string[]).includes(sectionKey)) {
      return sectionKey as SectionKey;
    }
    throw new BadRequestException(`Secao invalida: ${sectionKey}`);
  }
}
