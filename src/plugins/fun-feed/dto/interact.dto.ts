import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InteractDto {
  @ApiProperty({ enum: ['view', 'like', 'skip', 'save', 'report'] })
  @IsEnum(['view', 'like', 'skip', 'save', 'report'])
  action: 'view' | 'like' | 'skip' | 'save' | 'report';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportReason?: string;
}
