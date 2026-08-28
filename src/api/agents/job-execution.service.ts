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

export interface JobExecutionState {
  jobId: string;
  pluginId: string;
  pipeline: string;
  startTime: number;
  lastEventTime: number;
  timeline: TimelineEntry[];
  finalTokenUsage?: Record<string, unknown>;
  finalStatus: string;
  finalError?: unknown;
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
  ) { }

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
    // 1. Kiểm tra plugin, validate input và load config
    const { plugin, validatedInput, agentConfig } =
      await this.prepareExecution(pluginId, pipeline, body);

    // 2. Cấu hình HTTP Headers cho SSE
    this.setupSseHeaders(res);

    // 3. Khởi tạo Job State & Context
    const jobId = randomUUID();
    const startTime = Date.now();
    const state: JobExecutionState = {
      jobId,
      pluginId,
      pipeline,
      startTime,
      lastEventTime: startTime,
      timeline: [],
      finalStatus: 'running',
    };

    this.logger.log(
      `Bắt đầu chạy Job [${jobId}] cho Plugin: ${pluginId} | Pipeline: ${pipeline}`,
    );

    // 4. Đăng ký Job vào Redis & Bắn sự kiện khởi chạy
    await this.registerAndNotifyJobStart(jobId, pluginId, pipeline, startTime);

    const context = this.createExecutionContext(jobId, agentConfig);

    try {
      // 5. Thực thi Plugin Pipeline (Observable Stream)
      const stream$ = plugin.execute(pipeline, validatedInput, context);

      // 6. Subscribe và điều phối luồng dữ liệu
      const subscription = this.subscribeToPipelineStream(stream$, res, state);

      // 7. Xử lý khi Client chủ động ngắt kết nối
      this.handleClientDisconnect(req, subscription, state);
    } catch (syncErr: unknown) {
      await this.handleInitError(state, syncErr, res);
    }
  }

  /**
   * Validation & Config Loading
   */
  private async prepareExecution(
    pluginId: string,
    pipeline: string,
    body: Record<string, unknown>,
  ) {
    const plugin = this.pluginRegistry.getPlugin(pluginId);
    if (!plugin) {
      throw new HttpException(
        'Agent Plugin không tồn tại',
        HttpStatus.NOT_FOUND,
      );
    }

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

    return { plugin, validatedInput, agentConfig };
  }

  /**
   * Thiết lập HTTP Headers chuẩn cho SSE
   */
  private setupSseHeaders(res: ExtendedResponse): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
  }

  /**
   * Ghi chunk SSE dữ liệu tới Client
   */
  private writeSseEvent(res: ExtendedResponse, data: unknown): void {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') {
      res.flush();
    }
  }

  /**
   * Tạo ExecutionContext phục vụ các Node trong Pipeline
   */
  private createExecutionContext(
    jobId: string,
    agentConfig: Record<string, unknown> | null,
  ) {
    return {
      jobId,
      config: agentConfig,
      log: (message: string, meta?: unknown) => {
        this.logger.log(
          `[Job ${jobId}] ${message} ${meta ? JSON.stringify(meta) : ''}`,
        );
      },
    };
  }

  /**
   * Ghi nhận Job vào Redis Active Tracker và bắn sự kiện JOB_STARTED qua Pub/Sub
   */
  private async registerAndNotifyJobStart(
    jobId: string,
    pluginId: string,
    pipeline: string,
    startTime: number,
  ): Promise<void> {
    await this.activeJobTracker.registerActiveJob(jobId, {
      pluginId,
      pipeline,
      startedAt: startTime,
    });

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
  }

  /**
   * Lắng nghe luồng dữ liệu từ Observable Pipeline và cập nhật trạng thái
   */
  private subscribeToPipelineStream(
    stream$: unknown,
    res: ExtendedResponse,
    state: JobExecutionState,
  ) {
    return (stream$ as any).subscribe({
      next: (event: AgentStreamEvent) => {
        this.handleStreamNext(event, res, state);
      },
      error: async (err: unknown) => {
        await this.handleStreamError(err, res, state);
      },
      complete: async () => {
        await this.handleStreamComplete(res, state);
      },
    });
  }

  /**
   * Xử lý sự kiện kế tiếp trong Stream
   */
  private handleStreamNext(
    event: AgentStreamEvent,
    res: ExtendedResponse,
    state: JobExecutionState,
  ): void {
    this.writeSseEvent(res, event);

    // Bắn sự kiện JOB_STEP cho Dashboard
    this.redisPubSub
      .publishEvent({
        type: 'JOB_STEP',
        jobId: state.jobId,
        pluginId: state.pluginId,
        timestamp: Date.now(),
        data: event,
      })
      .catch(() => { });

    // Cập nhật currentStep vào Redis Hash
    if (event.message) {
      const completedStepName =
        event.status === 'completed' && event.stepId
          ? event.stepId
          : undefined;
      this.activeJobTracker
        .updateActiveJobStep(state.jobId, event.message, completedStepName)
        .catch(() => { });
    }

    // Bắt sự kiện timeline của các Node
    if (event.status === 'completed' || event.status === 'failed') {
      const now = Date.now();
      state.timeline.push({
        nodeName: event.stepId || 'unknown_node',
        status: event.status,
        durationMs: now - state.lastEventTime,
        timestamp: new Date(),
      });
      state.lastEventTime = now;
    }

    // Bắt Token Usage ở event cuối cùng
    if (event.status === 'done' && event.payload?.tokenUsage) {
      state.finalTokenUsage = event.payload.tokenUsage as Record<
        string,
        unknown
      >;
      if (state.finalStatus !== 'failed') {
        state.finalStatus = 'completed';
      }
    }

    // Bắt trạng thái lỗi nếu step phát ra status failed
    if (event.status === 'failed') {
      state.finalStatus = 'failed';
      state.finalError = {
        failedNode: event.stepId || 'unknown_node',
        message: event.message || 'Pipeline execution failed',
      };
    }
  }

  /**
   * Xử lý khi luồng bị lỗi ở cấp độ Observable
   */
  private async handleStreamError(
    err: unknown,
    res: ExtendedResponse,
    state: JobExecutionState,
  ): Promise<void> {
    const errMsg = err instanceof Error ? err.message : String(err);
    this.logger.error(`Job [${state.jobId}] Lỗi: ${errMsg}`);
    this.writeSseEvent(res, {
      status: 'failed',
      message: `Lỗi hệ thống: ${errMsg}`,
    });

    this.redisPubSub
      .publishEvent({
        type: 'JOB_FAILED',
        jobId: state.jobId,
        pluginId: state.pluginId,
        pipeline: state.pipeline,
        timestamp: Date.now(),
        data: { error: errMsg },
      })
      .catch(() => { });

    await this.cleanupAndFinalize(state, 'failed', errMsg);
    res.end();
  }

  /**
   * Xử lý khi luồng Pipeline kết thúc thành công
   */
  private async handleStreamComplete(
    res: ExtendedResponse,
    state: JobExecutionState,
  ): Promise<void> {
    this.logger.log(
      `Job [${state.jobId}] Hoàn tất với trạng thái: ${state.finalStatus}`,
    );

    if (state.finalStatus === 'failed') {
      this.redisPubSub
        .publishEvent({
          type: 'JOB_FAILED',
          jobId: state.jobId,
          pluginId: state.pluginId,
          pipeline: state.pipeline,
          timestamp: Date.now(),
          data: { error: state.finalError },
        })
        .catch(() => { });
    } else {
      state.finalStatus = 'completed';
      this.redisPubSub
        .publishEvent({
          type: 'JOB_COMPLETED',
          jobId: state.jobId,
          pluginId: state.pluginId,
          pipeline: state.pipeline,
          timestamp: Date.now(),
          data: {
            status: state.finalStatus,
            tokenUsage: state.finalTokenUsage,
          },
        })
        .catch(() => { });
    }

    await this.cleanupAndFinalize(state, state.finalStatus, state.finalError);
    res.end();
  }

  /**
   * Xử lý ngắt kết nối Client từ phía HTTP Request
   */
  private handleClientDisconnect(
    req: Request,
    subscription: any,
    state: JobExecutionState,
  ): void {
    if (req && typeof req.on === 'function') {
      req.on('close', async () => {
        if (!subscription.closed && state.finalStatus === 'running') {
          this.logger.warn(
            `Job [${state.jobId}] Client ngắt kết nối đột ngột. Hủy bỏ tiến trình và dọn dẹp Redis...`,
          );
          subscription.unsubscribe();

          const disconnectError = {
            message: 'Client disconnected prematurely',
          };

          this.redisPubSub
            .publishEvent({
              type: 'JOB_FAILED',
              jobId: state.jobId,
              pluginId: state.pluginId,
              pipeline: state.pipeline,
              timestamp: Date.now(),
              data: { error: disconnectError },
            })
            .catch(() => { });

          await this.cleanupAndFinalize(state, 'failed', disconnectError);
        }
      });
    }
  }

  /**
   * Xử lý lỗi khởi tạo đồng bộ
   */
  private async handleInitError(
    state: JobExecutionState,
    syncErr: unknown,
    res: ExtendedResponse,
  ): Promise<void> {
    const errMsg =
      syncErr instanceof Error ? syncErr.message : String(syncErr);
    this.logger.error(`Lỗi khi khởi tạo Job [${state.jobId}]: ${errMsg}`);
    this.redisPubSub
      .publishEvent({
        type: 'JOB_FAILED',
        jobId: state.jobId,
        pluginId: state.pluginId,
        pipeline: state.pipeline,
        timestamp: Date.now(),
        data: { error: errMsg },
      })
      .catch(() => { });
    await this.cleanupAndFinalize(state, 'failed', errMsg);
    res.end();
  }

  /**
   * Dọn dẹp Redis và ghi Log DB an toàn
   */
  private async cleanupAndFinalize(
    state: JobExecutionState,
    status: string,
    error?: unknown,
  ): Promise<void> {
    state.finalStatus = status;
    if (error) state.finalError = error;

    try {
      await this.activeJobTracker.removeActiveJob(state.jobId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Lỗi dọn dẹp Redis Key cho Job [${state.jobId}]: ${msg}`,
      );
    }

    try {
      await this.saveAgentLog(
        state.jobId,
        state.pluginId,
        state.pipeline,
        state.startTime,
        state.finalStatus,
        state.timeline,
        state.finalTokenUsage,
        state.finalError,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Lỗi lưu DB Log cho Job [${state.jobId}]: ${msg}`,
      );
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
