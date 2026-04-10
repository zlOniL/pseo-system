import { IsString, IsOptional, IsUUID } from 'class-validator';
import { GenerateDto } from './generate.dto';

export class RegenerateDto extends GenerateDto {
  @IsUUID()
  content_id: string;

  @IsOptional()
  @IsString()
  feedback?: string;
}
