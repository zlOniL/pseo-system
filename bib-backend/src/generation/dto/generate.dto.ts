import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsArray,
  ValidateNested,
  IsUUID,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RelatedService {
  @IsString()
  name: string;

  @IsString()
  url: string;
}

export class GenerateDto {
  @IsString()
  main_keyword: string;

  @IsString()
  service: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  tone?: string;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(10000)
  min_words?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RelatedService)
  related_services?: RelatedService[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsString()
  video_url?: string;

  @IsOptional()
  @IsString()
  locality_notes?: string;

  @IsOptional()
  @IsString()
  service_notes?: string;

  @IsOptional()
  @IsUUID()
  service_id?: string;

  @IsOptional()
  @IsUUID()
  site_id?: string;

  @IsOptional()
  @IsBoolean()
  skip_backlinks?: boolean;

  @IsOptional()
  @IsString()
  wordpress_category?: string;

  @IsOptional()
  @IsString()
  output_format?: 'html' | 'whitelabel_json';

  @IsOptional()
  content_json?: unknown;

  @IsOptional()
  @IsString()
  external_page_type?: 'service' | 'service_location' | 'page';

  @IsOptional()
  @IsString()
  external_slug?: string;
}
