import {
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
import { ServicesService } from './services.service';
import { GenerationService } from '../generation/generation.service';
import { buildLocalKeyword } from '../common/location-preposition';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { GenerateTemplateDto } from './dto/generate-template.dto';
import { FtpHtmlImportService } from '../integrations/ftp-html/ftp-html-import.service';
import { ImportFtpRemotePageDto } from '../integrations/ftp-html/dto/import-ftp-remote-page.dto';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly generationService: GenerationService,
    private readonly ftpHtmlImport: FtpHtmlImportService,
  ) {}

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Get()
  findAll(@Query('site_id') siteId?: string) {
    return this.servicesService.findAll(siteId);
  }

  @Get(':id/template')
  getTemplate(@Param('id') id: string) {
    return this.servicesService.getTemplate(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.servicesService.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceDto) {
    return this.servicesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  delete(@Param('id') id: string) {
    return this.servicesService.delete(id);
  }

  @Post(':id/ftp-html/check-remote-page')
  async checkFtpRemotePage(
    @Param('id') id: string,
    @Body() dto: ImportFtpRemotePageDto,
  ) {
    const service = await this.servicesService.findById(id);
    return this.ftpHtmlImport.checkRemotePage(service, dto.remote_path);
  }

  @Get(':id/ftp-html/template-status')
  async getFtpTemplateStatus(
    @Param('id') id: string,
    @Query('remote_path') remotePath?: string,
  ) {
    const service = await this.servicesService.findById(id);
    return this.ftpHtmlImport.getTemplateStatus(service, remotePath);
  }

  @Post(':id/ftp-html/import-remote-page')
  async importFtpRemotePage(
    @Param('id') id: string,
    @Body() dto: ImportFtpRemotePageDto,
  ) {
    const service = await this.servicesService.findById(id);
    return this.ftpHtmlImport.importRemotePage(service, dto.remote_path);
  }

  @Post(':id/generate-template')
  async generateTemplate(
    @Param('id') id: string,
    @Body() dto: GenerateTemplateDto,
  ) {
    const service = await this.servicesService.findById(id);
    const baseCity = dto.base_city ?? 'Lisboa';
    const mainKeyword = buildLocalKeyword(service.name, baseCity);
    const images = service.images ?? [];
    const videoUrl = service.video_url ?? null;

    const content = await this.generationService.generate({
      main_keyword: mainKeyword,
      service: service.name,
      city: baseCity,
      images,
      video_url: videoUrl ?? undefined,
      tone: service.tone,
      min_words: service.min_words,
      service_notes: dto.service_notes ?? service.service_notes ?? undefined,
      related_services: service.related_services ?? [],
      service_id: service.id,
    });

    const updatedService = await this.servicesService.saveTemplate(
      id,
      content.html ?? '',
      baseCity,
      images,
      videoUrl,
    );

    return { content, service: updatedService };
  }
}
