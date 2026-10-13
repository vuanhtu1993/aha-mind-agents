/**
 * @file review-session-query.dto.ts
 * @description Query parameters cho endpoint GET /api/vocab/review/session
 *
 * Made by Anh Tu - Share to be share
 */

import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ReviewSessionQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(30)
  limit?: number = 15;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  practiceAll?: boolean = false;
}
