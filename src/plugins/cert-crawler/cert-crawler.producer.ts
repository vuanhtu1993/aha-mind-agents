/**
 * @file cert-crawler.producer.ts
 * @description Producer Service lấy danh sách câu hỏi theo batch (Delta Sync) và đẩy vào BullMQ
 *
 * Made by Anh Tu - Share to be share
 */

import {
  Injectable,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Queue } from 'bullmq';
import axios from 'axios';
import {
  CERT_CRAWLER_QUEUE,
  CRAWL_QUESTION_JOB,
  HOCCUNGSUSHI_BASE_URL,
  DEFAULT_CRAWLER_SOURCE,
  CERT_BATCH_SIZE,
  CERT_BATCH_DELAY_MS,
  CERT_JOB_ATTEMPTS,
  CERT_JOB_BACKOFF_DELAY_MS,
} from './cert-crawler.constants';
import { RawQuestionItem, CrawlQuestionJobData } from './interfaces/cert-crawler.interface';
import { CertCrawlerCooldownService } from './services/cert-crawler-cooldown.service';
import { CertCrawlerCampaignService } from './services/cert-crawler-campaign.service';
import {
  CertQuestion,
  CertQuestionDocument,
} from '../../infra/database/schemas/cert-question.schema';
import { AHA_TOOLS_CONNECTION } from '../../infra/database/database.constants';

@Injectable()
export class CertCrawlerProducerService {
  private readonly logger = new Logger(CertCrawlerProducerService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectQueue(CERT_CRAWLER_QUEUE) private readonly crawlerQueue: Queue,
    @InjectModel(CertQuestion.name, AHA_TOOLS_CONNECTION)
    private readonly certQuestionModel: Model<CertQuestionDocument>,
    private readonly cooldownService: CertCrawlerCooldownService,
    private readonly campaignService: CertCrawlerCampaignService,
  ) { }

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
   * Lấy tập hợp các externalId đã hoàn tất (có đủ cả correctAnswer và aiExpertVi) trong DB
   */
  private async getCompletedExternalIds(certId: string): Promise<Set<number>> {
    const completedDocs = await this.certQuestionModel
      .find({
        certId,
        correctAnswer: { $exists: true, $nin: ['', null] },
        aiExpertVi: { $exists: true, $nin: ['', null] },
      })
      .select('externalId')
      .lean();

    return new Set(completedDocs.map((d) => d.externalId));
  }

  /**
   * Lấy hoặc tạo mới attempt cho certId
   */
  async getOrCreateAttempt(certId: string): Promise<{ attemptId: number; questionIds: number[] }> {
    const headers = this.getAuthHeaders();
    const attemptsUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts?cert_id=${encodeURIComponent(certId)}`;

    let attempt: any = null;
    try {
      const res = await axios.get(attemptsUrl, { headers });
      attempt = res.data?.attempt;
    } catch (err: any) {
      const status = err.response?.status || HttpStatus.BAD_GATEWAY;
      const errorData = err.response?.data?.error || err.message;
      this.logger.error(`Lỗi khi lấy attempt cho chứng chỉ [${certId}]: ${errorData}`);
      throw new HttpException(
        {
          statusCode: status,
          message: `Không thể kiểm tra attempt từ nguồn Sushi cho [${certId}]: ${errorData}`,
          sourceError: err.response?.data,
        },
        status,
      );
    }

    // Nếu chưa có attempt, tự động tạo mới
    if (!attempt?.id) {
      this.logger.log(`Tạo attempt mới cho chứng chỉ: ${certId}`);

      // 1. Tự động lấy danh mục câu hỏi từ index của cert nếu hệ thống nguồn yêu cầu question_ids
      let initialQuestionIds: number[] = [];
      try {
        const certUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/${encodeURIComponent(certId)}`;
        const certRes = await axios.get(certUrl, { headers });
        const indexList = certRes.data?.index || [];
        initialQuestionIds = indexList.map((item: { id: number }) => item.id).filter(Boolean);
        if (initialQuestionIds.length > 0) {
          this.logger.log(
            `Đã lấy được ${initialQuestionIds.length} question_ids từ index của chứng chỉ [${certId}]`,
          );
        }
      } catch (err: any) {
        this.logger.warn(`Không thể nạp index từ /api/cert/${certId}: ${err.message}`);
      }

      // 2. Gửi request tạo attempt kèm question_ids
      try {
        const payload: Record<string, any> = { cert_id: certId, mode: 'practice' };
        if (initialQuestionIds.length > 0) {
          payload.question_ids = initialQuestionIds;
        }

        const createRes = await axios.post(
          `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts`,
          payload,
          { headers },
        );
        attempt = createRes.data?.attempt;
      } catch (err: any) {
        const status = err.response?.status || HttpStatus.BAD_GATEWAY;
        const errorData = err.response?.data?.error || err.message;
        this.logger.error(`Lỗi khi tạo attempt mới cho [${certId}]: ${errorData}`);
        throw new HttpException(
          {
            statusCode: status,
            message: `Nguồn Sushi từ chối tạo bài luyện tập cho [${certId}]: "${errorData}". Hướng dẫn: Bạn cần đăng nhập web hoccungsushi.com và bấm vào chứng chỉ này để bắt đầu bài thi/luyện tập 1 lần để hệ thống nguồn sinh danh sách câu hỏi.`,
            sourceError: err.response?.data,
          },
          status,
        );
      }
    }

    if (!attempt?.id) {
      throw new BadRequestException(`Không thể khởi tạo attempt cho chứng chỉ: ${certId}`);
    }

    // Lấy chi tiết attempt để lấy mảng question_ids chính xác
    let detailRes: any = null;
    try {
      detailRes = await axios.get(
        `${HOCCUNGSUSHI_BASE_URL}/api/cert/attempts/${attempt.id}`,
        { headers },
      );
    } catch (err: any) {
      const status = err.response?.status || HttpStatus.BAD_GATEWAY;
      const errorData = err.response?.data?.error || err.message;
      this.logger.error(`Lỗi khi lấy chi tiết attempt [${attempt.id}]: ${errorData}`);
      throw new HttpException(
        {
          statusCode: status,
          message: `Không thể lấy chi tiết câu hỏi từ attempt [${attempt.id}]: ${errorData}`,
          sourceError: err.response?.data,
        },
        status,
      );
    }

    const questionIds: number[] =
      detailRes.data?.attempt?.question_ids ||
      detailRes.data?.refs?.map((r: { id: number }) => r.id) ||
      [];

    if (!questionIds.length) {
      throw new BadRequestException(`Không tìm thấy câu hỏi nào cho chứng chỉ: ${certId}`);
    }

    return { attemptId: attempt.id, questionIds };
  }

  /**
   * Kích hoạt đồng bộ câu hỏi của certId (hỗ trợ Delta Sync & Kiểm tra Cooldown)
   */
  async triggerSync(certId: string, force = false, resetCooldown = false) {
    // 1. Kiểm tra & Xử lý cờ Cooldown của nguồn
    if (resetCooldown) {
      await this.cooldownService.resetCooldown(DEFAULT_CRAWLER_SOURCE);
    }

    const cooldown = await this.cooldownService.getCooldownStatus(DEFAULT_CRAWLER_SOURCE);
    if (cooldown.isLocked) {
      this.logger.warn(
        `🛑 [Cooldown Blocked] Yêu cầu sync bị từ chối do nguồn [${cooldown.source}] đang giãn cách. Còn lại ${cooldown.remainingMinutes} phút.`,
      );
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Nguồn [${cooldown.source}] đang trong thời gian giãn cách hạn ngạch (Rate Limit Cooldown). Vui lòng thử lại sau ${cooldown.remainingMinutes} phút.`,
          source: cooldown.source,
          remainingMinutes: cooldown.remainingMinutes,
          lockedUntil: cooldown.lockedUntil,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Khởi tạo và đồng bộ
    this.logger.log(`Bắt đầu đồng bộ chứng chỉ: ${certId} (force=${force})`);
    const { attemptId, questionIds } = await this.getOrCreateAttempt(certId);

    let pendingIds = questionIds;
    let skippedQuestions = 0;

    if (!force) {
      const completedSet = await this.getCompletedExternalIds(certId);
      pendingIds = questionIds.filter((id) => !completedSet.has(id));
      skippedQuestions = questionIds.length - pendingIds.length;
    }

    this.logger.log(
      `[${certId}] Tổng số: ${questionIds.length} câu | Đã hoàn tất (bỏ qua): ${skippedQuestions} | Cần đồng bộ: ${pendingIds.length} (Attempt ID: ${attemptId})`,
    );

    if (pendingIds.length === 0) {
      const campaignId = await this.campaignService.startCampaign(certId, 0);
      await this.campaignService.finishCampaign(campaignId, certId, 0);
      return {
        campaignId,
        certId,
        attemptId,
        totalQuestions: questionIds.length,
        skippedQuestions,
        queuedJobs: 0,
      };
    }

    const campaignId = await this.campaignService.startCampaign(certId, pendingIds.length);
    const headers = this.getAuthHeaders();
    const allQuestions: RawQuestionItem[] = [];

    // Chia thành các batch tối đa 20 câu và nghỉ nhẹ giữa các batch để tránh spike request
    for (let i = 0; i < pendingIds.length; i += CERT_BATCH_SIZE) {
      const batchIds = pendingIds.slice(i, i + CERT_BATCH_SIZE).join(',');
      const batchUrl = `${HOCCUNGSUSHI_BASE_URL}/api/cert/${certId}?ids=${batchIds}`;
      try {
        const batchRes = await axios.get(batchUrl, { headers });
        const questions: RawQuestionItem[] = batchRes.data?.questions || [];
        allQuestions.push(...questions);
      } catch (err: any) {
        const status = err.response?.status || HttpStatus.BAD_GATEWAY;
        const errorData = err.response?.data?.error || err.message;
        this.logger.error(`Lỗi khi tải batch câu hỏi [${batchIds}]: ${errorData}`);
        throw new HttpException(
          {
            statusCode: status,
            message: `Lỗi khi tải batch câu hỏi từ nguồn: ${errorData}`,
            sourceError: err.response?.data,
          },
          status,
        );
      }

      if (i + CERT_BATCH_SIZE < pendingIds.length && process.env.NODE_ENV !== 'test') {
        await new Promise((resolve) => setTimeout(resolve, CERT_BATCH_DELAY_MS));
      }
    }

    // Tạo các atomic jobs cho BullMQ với jobId tất định để chống trùng lặp trên hàng đợi
    const jobs = allQuestions.map((q) => ({
      name: CRAWL_QUESTION_JOB,
      data: {
        certId,
        attemptId,
        question: q,
        campaignId,
        totalInBatch: pendingIds.length,
      } as CrawlQuestionJobData,
      opts: {
        jobId: `${certId}-${q.id}`,
        attempts: CERT_JOB_ATTEMPTS,
        backoff: { type: 'exponential', delay: CERT_JOB_BACKOFF_DELAY_MS },
        removeOnComplete: true,
        removeOnFail: false,
      },
    }));

    await this.crawlerQueue.addBulk(jobs);
    this.logger.log(`Đã đẩy ${jobs.length} jobs vào hàng đợi ${CERT_CRAWLER_QUEUE}`);

    return {
      campaignId,
      certId,
      attemptId,
      totalQuestions: questionIds.length,
      skippedQuestions,
      queuedJobs: jobs.length,
    };
  }
}
