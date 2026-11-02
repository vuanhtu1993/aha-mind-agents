/**
 * @file cert-crawler.processor.ts
 * @description Consumer Processor lấy đáp án chi tiết và upsert vào MongoDB
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  HOCCUNGSUSHI_BASE_URL,
} from './cert-crawler.constants';
import { CrawlQuestionJobData, RevealResponse } from './interfaces/cert-crawler.interface';
import { CertQuestion, CertQuestionDocument } from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Processor(CERT_CRAWLER_QUEUE, {
  limiter: {
    max: 5,
    duration: 1000,
  },
})
export class CertCrawlerProcessor extends WorkerHost {
  private readonly logger = new Logger(CertCrawlerProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
  ) {
    super();
  }

  async process(job: Job<CrawlQuestionJobData>): Promise<void> {
    const { certId, attemptId, question } = job.data;
    const cookie = this.configService.get<string>('HOCCUNGSUSHI_COOKIE');

    const revealUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts/${attemptId}/reveal?q=${question.id}&detail=1`;

    let revealData: RevealResponse = {};
    try {
      const res = await axios.get(revealUrl, {
        headers: {
          Cookie: cookie,
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        timeout: 10000,
      });
      revealData = res.data || {};
    } catch (error: any) {
      this.logger.warn(
        `Không thể lấy reveal cho câu hỏi ${question.id} (Cert: ${certId}): ${error.message}`,
      );
    }

    const correctAnswer =
      revealData.correct ||
      revealData.answer_key ||
      revealData.correct_verified ||
      '';

    const questionDoc = {
      certId,
      externalId: question.id,
      questionNo: question.question_no,
      topic: question.topic,
      guideRef: question.guide_ref,
      questionEn: question.question_en,
      questionVi: question.question_vi,
      questionJa: question.question_ja,
      optionsEn: question.options,
      optionsVi: question.options_vi,
      optionsJa: question.options_ja,
      isMulti: question.is_multi ?? false,
      correctAnswer,
      explanationEn: revealData.explanation,
      aiExpertVi: revealData.ai_expert,
      aiExpertJa: revealData.ai_expert_ja,
      sourceUrl: revealData.source_url,
      reviewConfidence: question.review_confidence,
    };

    await this.certQuestionModel.findOneAndUpdate(
      { certId, externalId: question.id },
      { $set: questionDoc },
      { upsert: true, new: true },
    );

    this.logger.log(`✅ [${certId}] Đã lưu câu hỏi #${question.question_no} (ID: ${question.id})`);
  }
}
