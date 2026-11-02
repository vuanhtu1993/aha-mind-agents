/**
 * @file sync-cert.dto.ts
 * @description DTO kích hoạt đồng bộ chứng chỉ
 *
 * Made by Anh Tu - Share to be share
 */

import { IsNotEmpty, IsString } from 'class-validator';

export class SyncCertDto {
  @IsString()
  @IsNotEmpty()
  certId: string;
}
