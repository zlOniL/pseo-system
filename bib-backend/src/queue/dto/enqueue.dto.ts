import { IsArray, IsString, IsUUID, ArrayMinSize } from 'class-validator';

export class EnqueueDto {
  @IsUUID()
  service_id: string;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  cities: string[];
}
