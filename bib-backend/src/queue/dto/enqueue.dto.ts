import {
  IsArray,
  IsString,
  IsUUID,
  ArrayMinSize,
  IsOptional,
  IsIn,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { GenerateTemplateDto } from '../../services/dto/generate-template.dto';

export class EnqueueDto {
  @IsUUID()
  service_id: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  cities: string[];

  @IsOptional()
  @IsIn(['ai', 'template', 'library'])
  mode?: 'ai' | 'template' | 'library';

  @IsOptional()
  @IsUUID()
  template_id?: string;
}

export class TemplateQueueRequestDto extends GenerateTemplateDto {
  @IsOptional()
  @IsUUID()
  template_id?: string;
}

export class EnqueueTemplatesDto {
  @IsUUID()
  service_id: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TemplateQueueRequestDto)
  templates: TemplateQueueRequestDto[];
}
