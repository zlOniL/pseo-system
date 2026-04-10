import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class BulkActionDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  @ArrayMinSize(1)
  ids: string[];
}
