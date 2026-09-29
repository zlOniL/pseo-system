import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type IntegrationType = 'wordpress' | 'whitelabel_api' | 'ftp_html';

export class CreateSiteDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe o nome do site.' })
  name: string;

  @IsString()
  @IsNotEmpty({ message: 'Informe o dominio do site.' })
  domain: string;

  @IsIn(['wordpress', 'whitelabel_api', 'ftp_html'])
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
}
