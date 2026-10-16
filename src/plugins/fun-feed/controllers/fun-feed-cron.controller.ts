import { Controller, Get, Req, UnauthorizedException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FunFeedIngestionService } from '../services/fun-feed-ingestion.service';
import { FUNNY_KEYWORDS_POOL } from '../config/keywords.config';

@ApiTags('Fun Feed Cron')
@ApiBearerAuth()
@Controller('funny-feed')
export class FunFeedCronController {
  private readonly logger = new Logger(FunFeedCronController.name);

  constructor(
    private readonly ingestionService: FunFeedIngestionService,
    private readonly configService: ConfigService,
  ) {}

  @Get('cron-ingest')
  @ApiOperation({ summary: 'Kích hoạt Ingest định kỳ từ Vercel Cron (Cần Authorization nếu có CRON_SECRET)' })
  async handleVercelCron(@Req() req?: Request | any) {
    const rawHeader = req?.headers?.['authorization'] || (typeof req === 'string' ? req : undefined);
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (cronSecret) {
      const token = rawHeader?.replace(/^Bearer\s+/i, '');
      if (token !== cronSecret) {
        this.logger.warn('Truy cập cron bị từ chối: Sai CRON_SECRET');
        throw new UnauthorizedException('Invalid cron authorization token');
      }
    }

    // Chọn ngẫu nhiên 1 từ khóa để cào nhanh trong 5-10s (tránh Vercel Timeout)
    const randomKeyword =
      FUNNY_KEYWORDS_POOL[Math.floor(Math.random() * FUNNY_KEYWORDS_POOL.length)];
    this.logger.log(`Bắt đầu Ingest cho từ khóa [${randomKeyword.keyword}]...`);

    const result = await this.ingestionService.ingestSingleKeyword(randomKeyword, 4);

    return {
      success: true,
      processedKeywords: 1,
      keyword: randomKeyword.keyword,
      topic: randomKeyword.topic,
      stats: result,
    };
  }
}
