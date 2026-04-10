import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { GenerationService } from './generation.service';
import { GenerateDto } from './dto/generate.dto';
import { RegenerateDto } from './dto/regenerate.dto';

@Controller()
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  @Post('generate')
  generate(@Body() dto: GenerateDto) {
    return this.generationService.generate(dto);
  }

  @Post('regenerate')
  @HttpCode(200)
  regenerate(@Body() dto: RegenerateDto) {
    return this.generationService.regenerate(dto);
  }
}
