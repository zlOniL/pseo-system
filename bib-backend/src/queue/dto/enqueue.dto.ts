import { IsArray, IsString, IsUUID, ArrayMinSize, IsOptional, IsIn } from 'class-validator';

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
