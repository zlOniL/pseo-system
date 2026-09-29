import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export type FtpSecurityMode = 'plain' | 'explicit_tls';

export class UpsertFtpSiteConfigDto {
  @IsString()
  @IsNotEmpty()
  host: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsIn(['plain', 'explicit_tls'])
  security_mode: FtpSecurityMode;

  @IsString()
  @IsNotEmpty()
  username: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsString()
  @IsNotEmpty()
  remote_root: string;

  @IsString()
  @IsNotEmpty()
  backup_root: string;

  @IsString()
  @IsNotEmpty()
  public_base_url: string;

  @IsOptional()
  @IsBoolean()
  passive_mode?: boolean;
}
