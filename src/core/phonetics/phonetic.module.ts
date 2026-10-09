/**
 * @file phonetic.module.ts
 * @description NestJS Module cung cấp PhoneticService dùng chung cho toàn bộ hệ thống
 *
 * Made by Anh Tu - Share to be share
 */

import { Module } from '@nestjs/common';
import { PhoneticService } from './phonetic.service';

@Module({
  providers: [PhoneticService],
  exports: [PhoneticService],
})
export class PhoneticModule {}
