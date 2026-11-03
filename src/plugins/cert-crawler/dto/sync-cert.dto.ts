/**
 * @file sync-cert.dto.ts
 * @description DTO kích hoạt đồng bộ chứng chỉ
 *
 * Made by Anh Tu - Share to be share
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SyncCertDto {
  @ApiProperty({
    description: 'ID của chứng chỉ cần đồng bộ (ví dụ: cca-f, ccao-f, ccar-p)',
    example: 'ccao-f',
  })
  @IsString()
  @IsNotEmpty()
  certId: string;

  @ApiPropertyOptional({
    description: 'Bắt buộc cào lại toàn bộ câu hỏi kể cả các câu đã hoàn tất trong DB',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;

  @ApiPropertyOptional({
    description: 'Bắt buộc mở khóa Cooldown trước khi cào (khi đã đổi cookie mới)',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  resetCooldown?: boolean;
}
