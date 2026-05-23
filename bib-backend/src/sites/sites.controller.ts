import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { SitesService } from './sites.service';
import { CreateSiteDto } from './dto/create-site.dto';
import { UpdateSiteDto } from './dto/update-site.dto';

@Controller('sites')
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  findAll() {
    return this.sites.findAll();
  }

  @Post()
  create(@Body() dto: CreateSiteDto) {
    return this.sites.create(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sites.findPublicById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSiteDto) {
    return this.sites.update(id, dto);
  }

  @Get(':id/blueprints')
  getBlueprints(@Param('id') id: string) {
    return this.sites.getBlueprints(id);
  }
}
