/**
 * @file story-shadowing.dto.ts
 * @description Data Transfer Objects (DTO) cho module Story Shadowing (Text & YouTube Pipelines)
 *
 * Mapped Client: aha-tools (Next.js PWA / Web Client)
 * Made by Anh Tu - Share to be share
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUrl, Length } from 'class-validator';

/**
 * DTO kích hoạt Pipeline xử lý văn bản thuần (Text Shadowing)
 */
export class CreateTextShadowingDto {
  @ApiProperty({
    description: 'Đoạn văn bản tiếng Anh cần phân tách thành bài học Shadowing (10 - 10000 ký tự)',
    example: 'Habits are the compound interest of self-improvement. Getting 1 percent better every day counts for a lot in the long run.',
    minLength: 10,
    maxLength: 10000,
  })
  @IsNotEmpty({ message: 'Văn bản không được để trống' })
  @IsString({ message: 'Văn bản phải là chuỗi ký tự' })
  @Length(10, 10000, { message: 'Văn bản phải từ 10 đến 10,000 ký tự' })
  text: string;

  @ApiPropertyOptional({
    description: 'Giọng đọc tổng hợp TTS chuẩn Google Cloud / ElevenLabs',
    example: 'FEMALE',
    default: 'FEMALE',
  })
  @IsOptional()
  @IsString()
  voice?: string;
}

/**
 * DTO kích hoạt Pipeline xử lý video YouTube (YouTube Shadowing)
 */
export class CreateYoutubeShadowingDto {
  @ApiProperty({
    description: 'Đường dẫn liên kết video YouTube hợp lệ có phụ đề (Closed Captions / Transcripts)',
    example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  })
  @IsNotEmpty({ message: 'URL YouTube không được để trống' })
  @IsUrl({}, { message: 'Link YouTube không đúng định dạng URL' })
  youtubeUrl: string;
}
