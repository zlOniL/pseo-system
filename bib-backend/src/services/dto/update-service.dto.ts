import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
  ValidateNested,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RelatedService } from '../../generation/dto/generate.dto';

export class UpdateServiceDto {
  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsString()
  name?: string;

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

  @IsOptional()
  @IsString()
  wordpress_category?: string;

  @IsOptional()
  @IsUUID()
  featured_image_asset_id?: string;

  @IsOptional()
  @IsString()
  featured_image_alt?: string;

  @IsOptional()
  @IsString()
  seo_title?: string;

  @IsOptional()
  @IsString()
  seo_description?: string;
}
