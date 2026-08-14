import {
  Injectable,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { ActiveJobTrackerService } from '../../core/services/active-job-tracker.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';
import { randomUUID } from 'crypto';

export type ExtendedResponse = Response & {
  flushHeaders?: () => void;
  flush?: () => void;
};

export interface AgentStreamEvent {
  status?: string;
  stepId?: string;
  message?: string;
  payload?: {
    tokenUsage?: Record<string, number | unknown>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface TimelineEntry {
  nodeName: string;
  status: string;
  durationMs: number;
  timestamp: Date;
}

@Injectable()
export class JobExecutionService {
  private readonly logger = new Logger(JobExecutionService.name);

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly redisPubSub: RedisPubSubService,
    private readonly activeJobTracker: ActiveJobTrackerService,
    @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION)
    private readonly agentExecLogModel: Model<AgentExecLog>,
    @InjectModel(AgentConfig.name, AHA_MIND_CONNECTION)
    private readonly agentConfigModel: Model<AgentConfig>,
  ) {}

  /**
   * Khởi chạy một Agent Pipeline và điều phối luồng dữ liệu SSE + Redis Pub/Sub + State Tracking
   */
  async executeAgentStream(
    pluginId: string,
    pipeline: string,
    body: Record<string, unknown>,
    req: Request,
    res: ExtendedResponse,
  ): Promise<void> {
    // 1. Tìm Plugin
    const plugin = this.pluginRegistry.getPlugin(pluginId);
    if (!plugin) {
      throw new HttpException(
        'Agent Plugin không tồn tại',
        HttpStatus.NOT_FOUND,
      );
    }

    // 2. Xác thực Input đầu vào
    let validatedInput: unknown;
    try {
      validatedInput = await plugin.validateInput(pipeline, body);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new HttpException(
        {
          message: 'Dữ liệu đầu vào không hợp lệ',
          error: errorMessage,
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. Truy xuất cấu hình của Agent từ Database (Dynamic Configuration)
    let agentConfig: Record<string, unknown> | null = null;
    try {
      agentConfig = (await this.agentConfigModel
        .findOne({ agentId: pluginId })
        .lean()) as Record<string, unknown> | null;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `Không thể lấy cấu hình AgentConfig cho plugin ${pluginId}: ${msg}`,
      );
    }

    // 4. Thiết lập HTTP Headers chuẩn cho SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    const jobId = randomUUID();
    const startTime = Date.now();
    this.logger.log(
      `Bắt đầu chạy Job [${jobId}] cho Plugin: ${pluginId} | Pipeline: ${pipeline}`,
    );

    // 5. Ghi nhận Job vào Redis State
    await this.activeJobTracker.registerActiveJob(jobId, {
      pluginId,
      pipeline,
      startedAt: startTime,
    });

    // 6. Bắn sự kiện JOB_STARTED cho Dashboard
    this.redisPubSub
      .publishEvent({
        type: 'JOB_STARTED',
        jobId,
        pluginId,
        pipeline,
        timestamp: startTime,
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Non-critical publishEvent error: ${msg}`);
      });

    // Hàm tiện ích ghi chunk SSE
    const writeSseEvent = (data: unknown) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      if (typeof res.flush === 'function') {
        res.flush();
      }
    };

    // 7. Tạo ExecutionContext
    const context = {
      jobId,
      config: agentConfig,
      log: (message: string, meta?: unknown) => {
        this.logger.log(
          `[Job ${jobId}] ${message} ${meta ? JSON.stringify(meta) : ''}`,
        );
      },
    };

    // Các biến phụ trợ cho việc lưu Log
    let lastEventTime = startTime;
    const timeline: TimelineEntry[] = [];
    let finalTokenUsage: Record<string, unknown> | undefined = undefined;
    let finalStatus = 'running';
    let finalError: unknown = undefined;

    // Hàm dọn dẹp Redis và ghi Log DB an toàn
    const cleanupAndFinalize = async (status: string, error?: unknown) => {
      finalStatus = status;
      if (error) finalError = error;

      try {
        await this.activeJobTracker.removeActiveJob(jobId);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Lỗi dọn dẹp Redis Key cho Job [${jobId}]: ${msg}`,
        );
      }

      try {
        await this.saveAgentLog(
          jobId,
          pluginId,
          pipeline,
          startTime,
          finalStatus,
          timeline,
          finalTokenUsage,
          finalError,
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Lỗi lưu DB Log cho Job [${jobId}]: ${msg}`,
        );
      }
    };

    try {
      // Kích hoạt Plugin duy nhất 1 lần
      const stream$ = plugin.execute(pipeline, validatedInput, context);

      // Đăng ký nhận luồng sự kiện
      const subscription = (stream$ as any).subscribe({
        next: (event: AgentStreamEvent) => {
          writeSseEvent(event);

          // Bắn sự kiện JOB_STEP cho Dashboard
          this.redisPubSub
            .publishEvent({
              type: 'JOB_STEP',
              jobId,
              pluginId,
              timestamp: Date.now(),
              data: event,
            })
            .catch(() => {});

          // Cập nhật currentStep vào Redis Hash
          if (event.message) {
            const completedStepName =
              event.status === 'completed' && event.stepId
                ? event.stepId
                : undefined;
            this.activeJobTracker
              .updateActiveJobStep(jobId, event.message, completedStepName)
              .catch(() => {});
          }

          // Bắt sự kiện timeline của các Node
          if (event.status === 'completed' || event.status === 'failed') {
            const now = Date.now();
            timeline.push({
              nodeName: event.stepId || 'unknown_node',
              status: event.status,
              durationMs: now - lastEventTime,
              timestamp: new Date(),
            });
            lastEventTime = now;
          }

          // Bắt Token Usage ở event cuối cùng
          if (event.status === 'done' && event.payload?.tokenUsage) {
            finalTokenUsage = event.payload.tokenUsage as Record<string, unknown>;
            if (finalStatus !== 'failed') {
              finalStatus = 'completed';
            }
          }

          // Bắt trạng thái lỗi nếu step phát ra status failed
          if (event.status === 'failed') {
            finalStatus = 'failed';
            finalError = {
              failedNode: event.stepId || 'unknown_node',
              message: event.message || 'Pipeline execution failed',
            };
          }
        },
        error: async (err: unknown) => {
          const errMsg = err instanceof Error ? err.message : String(err);
          this.logger.error(`Job [${jobId}] Lỗi: ${errMsg}`);
          writeSseEvent({
            status: 'failed',
            message: `Lỗi hệ thống: ${errMsg}`,
          });

          this.redisPubSub
            .publishEvent({
              type: 'JOB_FAILED',
              jobId,
              pluginId,
              pipeline,
              timestamp: Date.now(),
              data: { error: errMsg },
            })
            .catch(() => {});

          await cleanupAndFinalize('failed', errMsg);
          res.end();
        },
        complete: async () => {
          this.logger.log(
            `Job [${jobId}] Hoàn tất với trạng thái: ${finalStatus}`,
          );

          if (finalStatus === 'failed') {
            this.redisPubSub
              .publishEvent({
                type: 'JOB_FAILED',
                jobId,
                pluginId,
                pipeline,
                timestamp: Date.now(),
                data: { error: finalError },
              })
              .catch(() => {});
          } else {
            finalStatus = 'completed';
            this.redisPubSub
              .publishEvent({
                type: 'JOB_COMPLETED',
                jobId,
                pluginId,
                pipeline,
                timestamp: Date.now(),
                data: { status: finalStatus, tokenUsage: finalTokenUsage },
              })
              .catch(() => {});
          }

          await cleanupAndFinalize(finalStatus, finalError);
          res.end();
        },
      });

      // Nếu Client ngắt kết nối đột ngột
      if (req && typeof req.on === 'function') {
        req.on('close', async () => {
          if (!subscription.closed && finalStatus === 'running') {
            this.logger.warn(
              `Job [${jobId}] Client ngắt kết nối đột ngột. Hủy bỏ tiến trình và dọn dẹp Redis...`,
            );
            subscription.unsubscribe();

            const disconnectError = {
              message: 'Client disconnected prematurely',
            };

            this.redisPubSub
              .publishEvent({
                type: 'JOB_FAILED',
                jobId,
                pluginId,
                pipeline,
                timestamp: Date.now(),
                data: { error: disconnectError },
              })
              .catch(() => {});

            await cleanupAndFinalize('failed', disconnectError);
          }
        });
      }
    } catch (syncErr: unknown) {
      const errMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
      this.logger.error(`Lỗi khi khởi tạo Job [${jobId}]: ${errMsg}`);
      this.redisPubSub
        .publishEvent({
          type: 'JOB_FAILED',
          jobId,
          pluginId,
          pipeline,
          timestamp: Date.now(),
          data: { error: errMsg },
        })
        .catch(() => {});
      await cleanupAndFinalize('failed', errMsg);
      res.end();
    }
  }

  /**
   * Lưu log thực thi xuống DB (MongoDB - aha_mind)
   */
  private async saveAgentLog(
    jobId: string,
    agentId: string,
    pipeline: string,
    startTime: number,
    status: string,
    timeline: TimelineEntry[],
    tokenUsage?: Record<string, unknown>,
    error?: unknown,
  ): Promise<void> {
    try {
      await this.agentExecLogModel.create({
        jobId,
        agentId,
        pipeline,
        status,
        durationMs: Date.now() - startTime,
        timeline,
        tokenUsage,
        error,
      });
      this.logger.log(`Lưu AgentExecLog thành công cho Job [${jobId}]`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Không thể lưu AgentExecLog cho Job [${jobId}]: ${msg}`,
      );
    }
  }
}
