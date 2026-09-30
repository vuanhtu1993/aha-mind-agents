/**
 * @file create-speaking-quiz-job.dto.ts
 * @description DTO kích hoạt Job sinh câu hỏi Speaking Quiz
 *
 * Made by Anh Tu - Share to be share
 */

import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsArray, IsBoolean } from 'class-validator';

export class CreateSpeakingQuizJobDto {
  @ApiPropertyOptional({
    description: 'MongoDB ObjectId của Storybook bài học',
    example: '679c1a2b3c4d5e6f7a8b9c0d',
  })
  @IsOptional()
  @IsString()
  storybookId?: string;

  @ApiPropertyOptional({
    description: 'Chủ đề tự do nếu không dùng Storybook',
    example: 'Remote Work vs Office Work',
  })
  @IsOptional()
  @IsString()
  customTopic?: string;

  @ApiPropertyOptional({
    description: 'Cấp độ ngôn ngữ theo chuẩn CEFR',
    enum: ['B1', 'B2', 'C1'],
    default: 'B2',
  })
  @IsOptional()
  @IsEnum(['B1', 'B2', 'C1'])
  level?: 'B1' | 'B2' | 'C1';

  @ApiPropertyOptional({
    description: 'Danh sách từ vựng mục tiêu bổ sung',
    type: [String],
    example: ['productivity', 'isolation'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetKeywords?: string[];

  @ApiPropertyOptional({
    description: 'Gắn cờ bắt buộc sinh mới bỏ qua câu hỏi đã tồn tại trong DB',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  forceRegenerate?: boolean;
}
