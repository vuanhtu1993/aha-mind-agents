/**
 * @file cert-crawler.producer.ts
 * @description Producer Service lấy danh sách câu hỏi theo batch và đẩy vào BullMQ
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  CRAWL_QUESTION_JOB,
  HOCCUNGSUSHI_BASE_URL,
} from './cert-crawler.constants';
import { RawQuestionItem, CrawlQuestionJobData } from './interfaces/cert-crawler.interface';

@Injectable()
export class CertCrawlerProducerService {
  private readonly logger = new Logger(CertCrawlerProducerService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(CERT_CRAWLER_QUEUE) private readonly crawlerQueue: Queue,
  ) {}

  private getAuthHeaders() {
    const cookie = this.configService.get<string>('HOCCUNGSUSHI_COOKIE');
    if (!cookie) {
      throw new BadRequestException('HOCCUNGSUSHI_COOKIE chưa được cấu hình trong .env');
    }
    return {
      Cookie: cookie,
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  /**
   * Lấy hoặc tạo mới attempt cho certId
   */
  async getOrCreateAttempt(certId: string): Promise<{ attemptId: number; questionIds: number[] }> {
    const headers = this.getAuthHeaders();
    const attemptsUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts?cert_id=${encodeURIComponent(certId)}`;

    const res = await axios.get(attemptsUrl, { headers });
    let attempt = res.data?.attempt;

    // Nếu chưa có attempt, tự động tạo mới
    if (!attempt?.id) {
      this.logger.log(`Tạo attempt mới cho chứng chỉ: ${certId}`);
      const createRes = await axios.post(
        `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts`,
        { cert_id: certId, mode: 'practice' },
        { headers },
      );
      attempt = createRes.data?.attempt;
    }

    if (!attempt?.id) {
      throw new BadRequestException(`Không thể khởi tạo attempt cho chứng chỉ: ${certId}`);
    }

    // Lấy chi tiết attempt để lấy mảng question_ids chính xác
    const detailRes = await axios.get(
      `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts/${attempt.id}`,
      { headers },
    );

    const questionIds =
      detailRes.data?.attempt?.question_ids ||
      detailRes.data?.refs?.map((r: { id: number }) => r.id) ||
      [];

    if (!questionIds.length) {
      throw new BadRequestException(`Không tìm thấy câu hỏi nào cho chứng chỉ: ${certId}`);
    }

    return { attemptId: attempt.id, questionIds };
  }

  /**
   * Kích hoạt cào toàn bộ câu hỏi của certId
   */
  async triggerSync(certId: string) {
    this.logger.log(`Bắt đầu đồng bộ chứng chỉ: ${certId}`);
    const { attemptId, questionIds } = await this.getOrCreateAttempt(certId);
    this.logger.log(`Tìm thấy ${questionIds.length} câu hỏi. Attempt ID: ${attemptId}`);

    const headers = this.getAuthHeaders();
    const batchSize = 20;
    const allQuestions: RawQuestionItem[] = [];

    // Chia thành các batch tối đa 20 câu
    for (let i = 0; i < questionIds.length; i += batchSize) {
      const batchIds = questionIds.slice(i, i + batchSize).join(',');
      const batchUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/${certId}?ids=${batchIds}`;
      const batchRes = await axios.get(batchUrl, { headers });
      const questions: RawQuestionItem[] = batchRes.data?.questions || [];
      allQuestions.push(...questions);
    }

    // Tạo các atomic jobs cho BullMQ
    const jobs = allQuestions.map((q) => ({
      name: CRAWL_QUESTION_JOB,
      data: {
        certId,
        attemptId,
        question: q,
      } as CrawlQuestionJobData,
      opts: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
      },
    }));

    await this.crawlerQueue.addBulk(jobs);
    this.logger.log(`Đã đẩy ${jobs.length} jobs vào hàng đợi ${CERT_CRAWLER_QUEUE}`);

    return {
      certId,
      attemptId,
      totalQuestions: questionIds.length,
      queuedJobs: jobs.length,
    };
  }
}
