/**
 * @file submit-review.dto.ts
 * @description Request body cho endpoint POST /api/vocab/review/submit
 *
 * Made by Anh Tu - Share to be share
 */

import { IsBoolean, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class SubmitReviewDto {
  @IsString()
  @IsNotEmpty({ message: 'cardId không được để trống' })
  cardId: string;

  @IsBoolean()
  isCorrect: boolean;

  @IsInt()
  @Min(0)
  responseTimeMs: number;
}
