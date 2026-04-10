import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
  ValidateNested,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RelatedService } from '../../generation/dto/generate.dto';

export class CreateServiceDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  video_url?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedService)
  related_services?: RelatedService[];

  @IsOptional()
  @IsString()
  service_notes?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  min_words?: number;
}
