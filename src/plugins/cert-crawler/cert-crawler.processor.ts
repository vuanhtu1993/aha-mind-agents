/**
 * @file cert-crawler.processor.ts
 * @description Consumer Processor lấy đáp án chi tiết và upsert vào MongoDB (có tích hợp Circuit Breaker)
 *
 * Made by Anh Tu - Share to be share
 */

import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job, Queue } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  HOCCUNGSUSHI_BASE_URL,
  DEFAULT_CRAWLER_SOURCE,
} from './cert-crawler.constants';
import { CrawlQuestionJobData, RevealResponse } from './interfaces/cert-crawler.interface';
import { CertCrawlerCooldownService } from './services/cert-crawler-cooldown.service';
import {
  CertQuestion,
  CertQuestionDocument,
} from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Processor(CERT_CRAWLER_QUEUE, {
  limiter: {
    max: 3,
    duration: 1000,
  },
})
export class CertCrawlerProcessor extends WorkerHost {
  private readonly logger = new Logger(CertCrawlerProcessor.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
    @InjectQueue(CERT_CRAWLER_QUEUE)
    private readonly crawlerQueue: Queue,
    private readonly cooldownService: CertCrawlerCooldownService,
  ) {
    super();
  }

  async process(job: Job<CrawlQuestionJobData>): Promise<void> {
    const { certId, attemptId, question } = job.data;
    const cookie = this.configService.get<string>('HOCCUNGSUSHI_COOKIE');

    const questionDoc: Record<string, any> = {
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
      reviewConfidence: question.review_confidence,
    };

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
      revealData = res.data?.row || res.data?.question || res.data || {};
    } catch (error: any) {
      // Bảo toàn đề bài song ngữ vào DB trước
      await this.certQuestionModel.findOneAndUpdate(
        { certId, externalId: question.id },
        { $set: questionDoc },
        { upsert: true, new: true },
      );

      const status = error.response?.status;
      const msg: string = error.response?.data?.error || error.message || '';
      const attemptNum = (job.attemptsMade ?? 0) + 1;

      if (status === 429) {
        this.logger.error(
          `⚠️ [Rate Limit 429] ${msg} (ID: ${question.id}, Attempt: ${attemptNum})`,
        );

        // KÍCH HOẠT CẦU DAO (CIRCUIT BREAKER): Nếu chạm trần 200 câu/giờ
        const isQuotaCeiling =
          msg.includes('trần 200') ||
          msg.includes('quá nhiều trong một giờ') ||
          msg.toLowerCase().includes('quota') ||
          msg.toLowerCase().includes('too many requests');

        if (isQuotaCeiling) {
          this.logger.error(
            `🛑 [Circuit Breaker] Đã chạm trần hạn ngạch của [${DEFAULT_CRAWLER_SOURCE}]. Tiến hành xả hàng đợi và giãn cách 60 phút!`,
          );
          await this.cooldownService.setCooldown(DEFAULT_CRAWLER_SOURCE);
          await this.crawlerQueue.drain(true);
        }

        throw new Error(`Rate limit 429: ${msg}`);
      }

      this.logger.warn(
        `⚠️ Lỗi lấy reveal cho câu hỏi ${question.id} (Cert: ${certId}, Status: ${status || 'NETWORK'}, Attempt: ${attemptNum}): ${msg}`,
      );
      throw new Error(`Reveal fetch failed (${status || 'NETWORK'}): ${msg}`);
    }

    const correctAnswer =
      revealData.correct ||
      revealData.answer_key ||
      revealData.correct_verified;

    if (revealData.guide_ref) questionDoc.guideRef = revealData.guide_ref;
    if (correctAnswer) questionDoc.correctAnswer = correctAnswer;
    if (revealData.explanation) questionDoc.explanationEn = revealData.explanation;
    if (revealData.ai_expert) questionDoc.aiExpertVi = revealData.ai_expert;
    if (revealData.ai_expert_ja) questionDoc.aiExpertJa = revealData.ai_expert_ja;
    if (revealData.source_url) questionDoc.sourceUrl = revealData.source_url;
    if (revealData.source_ref) questionDoc.sourceRef = revealData.source_ref;

    await this.certQuestionModel.findOneAndUpdate(
      { certId, externalId: question.id },
      { $set: questionDoc },
      { upsert: true, new: true },
    );

    this.logger.log(`✅ [${certId}] Đã lưu câu hỏi #${question.question_no} (ID: ${question.id})`);
  }
}
