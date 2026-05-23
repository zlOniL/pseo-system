import { IsIn, IsOptional, IsString } from 'class-validator';

export type IntegrationType = 'wordpress' | 'whitelabel_api';

export class CreateSiteDto {
  @IsString()
  name: string;

  @IsString()
  domain: string;

  @IsIn(['wordpress', 'whitelabel_api'])
  integration_type: IntegrationType;

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
}
