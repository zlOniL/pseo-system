import { IsOptional, IsIn, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListContentsDto {
  @IsOptional()
  @IsIn(['draft', 'approved', 'published'])
  status?: 'draft' | 'approved' | 'published';

  @IsOptional()
  @IsString()
  service?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;
}
