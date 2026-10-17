import { Controller, Get, Req, Query, UnauthorizedException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
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
  @ApiQuery({ name: 'keyword', required: false, description: 'Từ khóa tùy chọn để cào (Mặc định chọn ngẫu nhiên trong pool)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Số lượng items cần cào (mặc định 4)' })
  @ApiQuery({ name: 'source', required: false, description: 'Nguồn cần cào: giphy, youtube, threads, reddit, all' })
  async handleVercelCron(
    @Req() req?: Request | any,
    @Query('keyword') customKeyword?: string,
    @Query('limit') customLimit?: string,
    @Query('source') customSource?: string,
  ) {
    const rawHeader = req?.headers?.['authorization'] || (typeof req === 'string' ? req : undefined);
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (cronSecret) {
      const token = rawHeader?.replace(/^Bearer\s+/i, '');
      if (token !== cronSecret) {
        this.logger.warn('Truy cập cron bị từ chối: Sai CRON_SECRET');
        throw new UnauthorizedException('Invalid cron authorization token');
      }
    }

    const validSources = ['giphy', 'youtube', 'threads', 'reddit', 'all'] as const;
    const resolvedSource = validSources.includes(customSource as any)
      ? (customSource as any)
      : undefined;

    const baseItem = customKeyword
      ? { keyword: customKeyword, topic: 'grammar' as const, source: resolvedSource || ('all' as const) }
      : FUNNY_KEYWORDS_POOL[Math.floor(Math.random() * FUNNY_KEYWORDS_POOL.length)];

    const keywordItem = resolvedSource ? { ...baseItem, source: resolvedSource } : baseItem;

    const limit = customLimit ? parseInt(customLimit, 10) : 4;
    this.logger.log(`Bắt đầu Ingest cho từ khóa [${keywordItem.keyword}] (source: ${keywordItem.source}, limit: ${limit})...`);

    const result = await this.ingestionService.ingestSingleKeyword(keywordItem, limit);

    return {
      success: true,
      processedKeywords: 1,
      keyword: keywordItem.keyword,
      topic: keywordItem.topic,
      source: keywordItem.source,
      stats: result,
    };
  }
}
