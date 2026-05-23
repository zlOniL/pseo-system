import { IsIn, IsOptional, IsString } from 'class-validator';
import type { IntegrationType } from './create-site.dto';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsIn(['wordpress', 'whitelabel_api'])
  integration_type?: IntegrationType;

  @IsOptional()
  @IsString()
  api_token?: string;

  @IsOptional()
  @IsString()
  wordpress_base_url?: string;

  @IsOptional()
  @IsString()
  wordpress_secret?: string;

  @IsOptional()
  @IsString()
  wordpress_proxy_base?: string;

  @IsOptional()
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}
