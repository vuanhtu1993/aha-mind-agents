/**
 * @file vocab-review.controller.ts
 * @description REST API Controller cho phiên ôn tập từ vựng FSRS
 *
 * Made by Anh Tu - Share to be share
 */

import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { VocabReviewService } from './services/vocab-review.service';
import { ReviewSessionQueryDto } from './dto/review-session-query.dto';
import { SubmitReviewDto } from './dto/submit-review.dto';

@ApiTags('Vocab Review')
@Controller('vocab/review')
export class VocabReviewController {
  constructor(private readonly vocabReviewService: VocabReviewService) {}

  @Get('session')
  @ApiOperation({ summary: 'Lấy danh sách câu hỏi phiên ôn tập trắc nghiệm / cloze' })
  public async getSession(@Query() query: ReviewSessionQueryDto) {
    return this.vocabReviewService.getReviewSession(query);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Nộp kết quả trắc nghiệm và cập nhật trạng thái FSRS' })
  public async submitReview(@Body() body: SubmitReviewDto) {
    return this.vocabReviewService.submitReview(body);
  }

  @Get('due-count')
  @ApiOperation({ summary: 'Thống kê số lượng từ đến hạn ôn tập và phân loại' })
  public async getDueCount() {
    return this.vocabReviewService.getDueCount();
  }
}
