import { IsOptional, IsString, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class RelatedServiceDto {
  @IsString()
  name: string;

  @IsString()
  url: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedServiceDto)
  related_services?: RelatedServiceDto[];
}
