import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import type { IntegrationType } from './create-site.dto';

export class UpdateSiteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do site.' })
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Informe o dominio do site.' })
  domain?: string;

  @IsOptional()
  @IsIn(['wordpress', 'whitelabel_api', 'ftp_html'])
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
  @IsIn(['active', 'archived'])
  status?: 'active' | 'archived';
}
