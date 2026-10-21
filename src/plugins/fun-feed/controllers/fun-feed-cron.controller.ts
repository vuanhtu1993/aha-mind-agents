import { Controller, Get, Req, Query, UnauthorizedException, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FunFeedIngestionService } from '../services/fun-feed-ingestion.service';
import { FUNNY_KEYWORDS_POOL } from '../config/keywords.config';

/**
 * FunFeedCronController: Tiếp nhận trigger định kỳ từ Vercel Cron hoặc các scheduler bên ngoài
 * để kích hoạt quy trình cào nội dung tiếng Anh giải trí.
 *
 * Hỗ trợ 2 luồng:
 * 1. GET /funny-feed/cron-channels: Thu thập theo danh mục kênh YouTube tuyển chọn (Khuyến nghị hàng ngày).
 * 2. GET /funny-feed/cron-ingest: Thu thập theo từ khóa ngẫu nhiên (hoặc hỗ trợ param mode=channels).
 *
 * Made by Anh Tu - Share to be share
 */

@ApiTags('Fun Feed Cron')
@ApiBearerAuth()
@Controller('funny-feed')
export class FunFeedCronController {
  private readonly logger = new Logger(FunFeedCronController.name);

  constructor(
    private readonly ingestionService: FunFeedIngestionService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Kiểm tra tính hợp lệ của CRON_SECRET trong header Authorization.
   */
  private validateCronAuth(req?: Request | any) {
    const rawHeader = req?.headers?.['authorization'] || (typeof req === 'string' ? req : undefined);
    const cronSecret = this.configService.get<string>('CRON_SECRET');
    if (cronSecret) {
      const token = rawHeader?.replace(/^Bearer\s+/i, '');
      if (token !== cronSecret) {
        this.logger.warn('Truy cập cron bị từ chối: Sai CRON_SECRET');
        throw new UnauthorizedException('Invalid cron authorization token');
      }
    }
  }

  @Get('cron-channels')
  @ApiOperation({ summary: 'Kích hoạt Ingest định kỳ theo kênh YouTube tuyển chọn (Curated Channels)' })
  @ApiQuery({ name: 'channelId', required: false, description: 'ID kênh YouTube tùy chọn để cào (Mặc định quét toàn bộ kênh active)' })
  @ApiQuery({ name: 'maxAgeHours', required: false, description: 'Khung thời gian xuất bản tính bằng giờ (mặc định 48h)' })
  @ApiQuery({ name: 'limitPerChannel', required: false, description: 'Số video tối đa mỗi kênh (mặc định 5)' })
  async handleChannelsCron(
    @Req() req?: Request | any,
    @Query('channelId') channelId?: string,
    @Query('maxAgeHours') maxAgeHours?: string,
    @Query('limitPerChannel') limitPerChannel?: string,
  ) {
    this.validateCronAuth(req);

    const parsedAge = maxAgeHours ? parseInt(maxAgeHours, 10) : 48;
    const parsedLimit = limitPerChannel ? parseInt(limitPerChannel, 10) : 5;

    this.logger.log(
      `Bắt đầu Daily Ingestion từ Curated YouTube Channels (maxAge: ${parsedAge}h, limitPerChannel: ${parsedLimit})...`,
    );

    const result = await this.ingestionService.ingestFromCuratedChannels({
      channelId,
      maxAgeHours: parsedAge,
      limitPerChannel: parsedLimit,
    });

    return {
      success: true,
      mode: 'channels',
      stats: result,
    };
  }

  @Get('cron-ingest')
  @ApiOperation({ summary: 'Kích hoạt Ingest định kỳ từ Vercel Cron (Cần Authorization nếu có CRON_SECRET)' })
  @ApiQuery({ name: 'mode', required: false, description: 'Chế độ ingest: keyword (mặc định) hoặc channels' })
  @ApiQuery({ name: 'keyword', required: false, description: 'Từ khóa tùy chọn để cào (Chế độ keyword)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Số lượng items cần cào (mặc định 4)' })
  @ApiQuery({ name: 'source', required: false, description: 'Nguồn cần cào: giphy, youtube, threads, reddit, all' })
  @ApiQuery({ name: 'maxAgeHours', required: false, description: 'Số giờ tối đa khi dùng mode=channels (mặc định 48)' })
  async handleVercelCron(
    @Req() req?: Request | any,
    @Query('mode') mode?: 'keyword' | 'channels',
    @Query('keyword') customKeyword?: string,
    @Query('limit') customLimit?: string,
    @Query('source') customSource?: string,
    @Query('maxAgeHours') maxAgeHours?: string,
  ) {
    this.validateCronAuth(req);

    // Nếu chọn mode=channels, điều hướng sang cào theo danh mục kênh tuyển chọn
    if (mode === 'channels') {
      const parsedAge = maxAgeHours ? parseInt(maxAgeHours, 10) : 48;
      const parsedLimit = customLimit ? parseInt(customLimit, 10) : 5;
      const result = await this.ingestionService.ingestFromCuratedChannels({
        maxAgeHours: parsedAge,
        limitPerChannel: parsedLimit,
      });

      return {
        success: true,
        mode: 'channels',
        stats: result,
      };
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
      mode: 'keyword',
      processedKeywords: 1,
      keyword: keywordItem.keyword,
      topic: keywordItem.topic,
      source: keywordItem.source,
      stats: result,
    };
  }
}
