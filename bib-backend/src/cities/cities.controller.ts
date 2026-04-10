import { Controller, Get } from '@nestjs/common';
import { CitiesService } from './cities.service';

@Controller('cities')
export class CitiesController {
  constructor(private readonly cities: CitiesService) {}

  @Get()
  getAll() {
    return this.cities.getAllRegions();
  }
}
