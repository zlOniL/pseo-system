import { IsOptional, IsString } from 'class-validator';

export class ImportFtpRemotePageDto {
  @IsOptional()
  @IsString()
  remote_path?: string;
}
