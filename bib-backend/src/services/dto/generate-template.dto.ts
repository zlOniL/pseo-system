import { IsOptional, IsString } from 'class-validator';

export class GenerateTemplateDto {
  @IsOptional()
  @IsString()
  base_city?: string;

  @IsOptional()
  @IsString()
  service_notes?: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
