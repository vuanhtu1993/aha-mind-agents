import { Controller, Get, Post, Param, Query, Body, Headers } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FunFeedService } from '../services/fun-feed.service';
import { FeedQueryDto } from '../dto/feed-query.dto';
import { InteractDto } from '../dto/interact.dto';

@ApiTags('Funny English Feed')
@Controller('funny-feed')
export class FunFeedController {
  constructor(private readonly funFeedService: FunFeedService) {}

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách Funny English Feed (Cursor Pagination cho TikTok UI)' })
  async getFeed(@Query() query: FeedQueryDto) {
    return this.funFeedService.getFeed(query);
  }

  @Post(':id/interact')
  @ApiOperation({ summary: 'Ghi nhận tương tác like, save, skip, report' })
  async interact(
    @Param('id') id: string,
    @Body() dto: InteractDto,
    @Headers('x-user-id') userId?: string,
  ) {
    return this.funFeedService.interact(id, userId || 'guest', dto);
  }
}
