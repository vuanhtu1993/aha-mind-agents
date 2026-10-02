/**
 * @file create-story-shadowing-job.dto.ts
 * @description DTO kích hoạt Job tạo bài học Shadowing (Text & YouTube Pipelines)
 *
 * Mapped Client: aha-tools (Next.js PWA / Web Client)
 * Made by Anh Tu - Share to be share
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';

export type ShadowingPipelineType = 'text' | 'youtube';

export class CreateStoryShadowingJobDto {
  @ApiProperty({
    description: 'Loại pipeline cần thực thi',
    enum: ['text', 'youtube'],
    example: 'text',
  })
  @IsNotEmpty({ message: 'Pipeline không được để trống' })
  @IsEnum(['text', 'youtube'], { message: 'Pipeline phải là text hoặc youtube' })
  pipeline: ShadowingPipelineType;

  @ApiPropertyOptional({
    description: 'Đoạn văn bản tiếng Anh (bắt buộc nếu pipeline là text)',
    example: 'Habits are the compound interest of self-improvement.',
  })
  @ValidateIf((o) => o.pipeline === 'text')
  @IsNotEmpty({ message: 'Văn bản text không được để trống khi chọn pipeline text' })
  @IsString({ message: 'Văn bản text phải là chuỗi ký tự' })
  text?: string;

  @ApiPropertyOptional({
    description: 'Giọng đọc TTS (cho text pipeline)',
    example: 'FEMALE',
    default: 'FEMALE',
  })
  @IsOptional()
  @IsString()
  voice?: string;

  @ApiPropertyOptional({
    description: 'Link YouTube hợp lệ (bắt buộc nếu pipeline là youtube)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @ValidateIf((o) => o.pipeline === 'youtube')
  @IsNotEmpty({ message: 'URL YouTube không được để trống khi chọn pipeline youtube' })
  @IsUrl({}, { message: 'URL YouTube không đúng định dạng URL' })
  youtubeUrl?: string;

  @ApiPropertyOptional({
    description: 'Bỏ qua kiểm tra bài đã tồn tại trong CSDL, ép buộc sinh lại',
    default: false,
  })
  @IsOptional()
  forceRegenerate?: boolean;
}
