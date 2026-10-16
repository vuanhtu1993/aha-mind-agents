import { IsOptional, IsEnum, IsInt, Min, Max, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FeedQueryDto {
  @ApiPropertyOptional({ enum: ['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'] })
  @IsOptional()
  @IsEnum(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'])
  topic?: string;

  @ApiPropertyOptional({ enum: ['beginner', 'intermediate', 'advanced'] })
  @IsOptional()
  @IsEnum(['beginner', 'intermediate', 'advanced'])
  level?: string;

  @ApiPropertyOptional({ description: 'Cursor timestamp (ISO Date) của item cuối trang trước' })
  @IsOptional()
  @IsDateString()
  cursor?: string;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit: number = 10;
}
