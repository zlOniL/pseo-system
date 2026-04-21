import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ServicesService } from './services.service';
import { GenerationService } from '../generation/generation.service';
import { CreateServiceDto } from './dto/create-service.dto';
import { UpdateServiceDto } from './dto/update-service.dto';
import { GenerateTemplateDto } from './dto/generate-template.dto';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
    private readonly generationService: GenerationService,
  ) { }

  @Post()
  create(@Body() dto: CreateServiceDto) {
    return this.servicesService.create(dto);
  }

  @Get()
  findAll() {
    return this.servicesService.findAll();
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
  @HttpCode(200)
  archive(@Param('id') id: string) {
    return this.servicesService.archive(id);
  }

  @Post(':id/generate-template')
  async generateTemplate(
    @Param('id') id: string,
    @Body() dto: GenerateTemplateDto,
  ) {
    const service = await this.servicesService.findById(id);
    const baseCity = dto.base_city ?? 'Lisboa';
    const mainKeyword = `${service.name} em ${baseCity}`;

    const effectiveImages = dto.images ?? service.images ?? [];
    const effectiveVideoUrl = dto.video_url ?? service.video_url ?? null;

    const content = await this.generationService.generate({
      main_keyword: mainKeyword,
      service: service.name,
      city: baseCity,
      images: effectiveImages,
      video_url: effectiveVideoUrl ?? undefined,
      tone: service.tone,
      min_words: service.min_words,
      service_notes: dto.service_notes ?? service.service_notes ?? undefined,
      related_services: service.related_services ?? [],
      service_id: service.id,
    });

    const updatedService = await this.servicesService.saveTemplate(
      id,
      content.html,
      baseCity,
      effectiveImages,
      effectiveVideoUrl,
    );

    return { content, service: updatedService };
  }
}
