import { Controller, Get, Post, Param, Body, Res, Req, HttpException, HttpStatus, Logger, Inject, HttpCode } from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { randomUUID } from 'crypto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';

@ApiTags('Agents (Gateway)')
@Controller('v1/agents')
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION) private readonly agentExecLogModel: Model<AgentExecLog>,
    @InjectModel(AgentConfig.name, AHA_MIND_CONNECTION) private readonly agentConfigModel: Model<AgentConfig>,
    private readonly redisPubSub: RedisPubSubService,
  ) { }

  /**
   * Lấy danh sách toàn bộ các plugins đang hoạt động
   */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các Agents Plugin' })
  async listPlugins() {
    return Array.from(this.pluginRegistry['plugins'].values()).map(p => p.metadata);
  }

  /**
   * API Khởi chạy Pipeline (Server-Sent Events)
   */
  @Post(':pluginId/:pipeline/stream')
  @ApiOperation({ summary: 'Khởi chạy một Agent Pipeline và nhận luồng dữ liệu SSE' })
  @ApiParam({ name: 'pluginId', example: 'story-shadowing', description: 'Tên của Plugin' })
  @ApiParam({ name: 'pipeline', example: 'youtube', description: 'Loại pipeline cần thực thi (vd: text, youtube)' })
  @ApiBody({
    description: 'Dữ liệu đầu vào phụ thuộc vào pipeline. \n- Với text: { "text": "Đoạn văn...", "voice": "FEMALE" } \n- Với youtube: { "youtubeUrl": "https..." }',
    schema: {
      type: 'object',
      properties: {
        youtubeUrl: { type: 'string', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'SSE Stream Connection Opened.' })
  @HttpCode(200)
  async executeAgentStream(
    @Param('pluginId') pluginId: string,
    @Param('pipeline') pipeline: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Tìm Plugin
    const plugin = this.pluginRegistry.getPlugin(pluginId);
    if (!plugin) {
      throw new HttpException('Agent Plugin không tồn tại', HttpStatus.NOT_FOUND);
    }

    // Xác thực Input đầu vào
    let validatedInput;
    try {
      validatedInput = await plugin.validateInput(pipeline, body);
    } catch (error: any) {
      throw new HttpException({
        message: 'Dữ liệu đầu vào không hợp lệ',
        error: error.message || error,
      }, HttpStatus.BAD_REQUEST);
    }

    // Truy xuất cấu hình của Agent từ Database (Dynamic Configuration)
    let agentConfig = null;
    try {
      agentConfig = await this.agentConfigModel.findOne({ agentId: pluginId }).lean();
    } catch (err: any) {
      this.logger.warn(`Không thể lấy cấu hình AgentConfig cho plugin ${pluginId}: ${err.message}`);
    }

    // Thiết lập HTTP Headers chuẩn cho SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Quan trọng để vượt qua các bộ đệm (buffers) của nginx hoặc proxy
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const jobId = randomUUID();
    const startTime = Date.now();
    this.logger.log(`Bắt đầu chạy Job [${jobId}] cho Plugin: ${pluginId} | Pipeline: ${pipeline}`);

    // Ghi nhận Job vào Redis Hash ngay khi bắt đầu (để hỗ trợ reload trang không mất vết)
    await this.redisPubSub.registerActiveJob(jobId, { pluginId, pipeline, startedAt: startTime });

    // Bắn sự kiện JOB_STARTED cho Dashboard
    this.redisPubSub.publishEvent({
      type: 'JOB_STARTED',
      jobId,
      pluginId,
      pipeline,
      timestamp: startTime,
    });

    // Hàm tiện ích ghi chunk SSE
    const writeSseEvent = (data: any) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
      // Force flush nếu Express hỗ trợ (để bypass buffer)
      if (typeof (res as any).flush === 'function') {
        (res as any).flush();
      }
    };

    // Tạo ExecutionContext
    const context = {
      jobId,
      config: agentConfig,
      log: (message: string, meta?: any) => {
        this.logger.log(`[Job ${jobId}] ${message} ${meta ? JSON.stringify(meta) : ''}`);
      }
    };

    // Kích hoạt Plugin
    const stream$ = plugin.execute(pipeline, validatedInput, context);

    // Các biến phụ trợ cho việc lưu Log
    let lastEventTime = startTime;
    const timeline: any[] = [];
    let finalTokenUsage: any = undefined;
    let finalStatus = 'running';
    let finalError: any = undefined;

    // Hàm tiện ích dọn dẹp Redis và ghi Log DB an toàn (chống rò rỉ Key trên Redis)
    const cleanupAndFinalize = async (status: string, error?: any) => {
      finalStatus = status;
      if (error) finalError = error;

      try {
        await this.redisPubSub.removeActiveJob(jobId);
      } catch (err: any) {
        this.logger.error(`Lỗi dọn dẹp Redis Key cho Job [${jobId}]: ${err.message}`);
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
          finalError
        );
      } catch (err: any) {
        this.logger.error(`Lỗi lưu DB Log cho Job [${jobId}]: ${err.message}`);
      }
    };

    try {
      // Kích hoạt Plugin
      const stream$ = plugin.execute(pipeline, validatedInput, context);

      // Đăng ký nhận luồng sự kiện
      const subscription = stream$.subscribe({
        next: (event) => {
          writeSseEvent(event);

          // Bắn sự kiện JOB_STEP cho Dashboard
          this.redisPubSub.publishEvent({
            type: 'JOB_STEP',
            jobId,
            pluginId,
            timestamp: Date.now(),
            data: event,
          });

          // Cập nhật currentStep & completed step snapshot vào Redis Hash (0 DB Write)
          if (event.message) {
            const completedStepName = (event.status === 'completed' && event.stepId) ? (event.stepId) : undefined;
            this.redisPubSub.updateActiveJobStep(jobId, event.message, completedStepName).catch(() => {});
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
            finalTokenUsage = event.payload.tokenUsage;
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
        error: async (err) => {
          this.logger.error(`Job [${jobId}] Lỗi: ${err.message}`);
          writeSseEvent({ status: 'failed', message: `Lỗi hệ thống: ${err.message}` });

          this.redisPubSub.publishEvent({
            type: 'JOB_FAILED',
            jobId,
            pluginId,
            pipeline,
            timestamp: Date.now(),
            data: { error: err.message },
          });

          await cleanupAndFinalize('failed', err.message);
          res.end();
        },
        complete: async () => {
          this.logger.log(`Job [${jobId}] Hoàn tất với trạng thái: ${finalStatus}`);

          if (finalStatus === 'failed') {
            this.redisPubSub.publishEvent({
              type: 'JOB_FAILED',
              jobId,
              pluginId,
              pipeline,
              timestamp: Date.now(),
              data: { error: finalError },
            });
          } else {
            finalStatus = 'completed';
            this.redisPubSub.publishEvent({
              type: 'JOB_COMPLETED',
              jobId,
              pluginId,
              pipeline,
              timestamp: Date.now(),
              data: { status: finalStatus, tokenUsage: finalTokenUsage },
            });
          }

          await cleanupAndFinalize(finalStatus, finalError);
          res.end();
        },
      });

      // Nếu Client (Trình duyệt) đóng trình duyệt hoặc ngắt kết nối đột ngột
      req.on('close', async () => {
        if (!subscription.closed && finalStatus === 'running') {
          this.logger.warn(`Job [${jobId}] Client ngắt kết nối đột ngột. Hủy bỏ tiến trình và dọn dẹp Redis...`);
          subscription.unsubscribe();

          const disconnectError = { message: 'Client disconnected prematurely' };

          this.redisPubSub.publishEvent({
            type: 'JOB_FAILED',
            jobId,
            pluginId,
            pipeline,
            timestamp: Date.now(),
            data: { error: disconnectError },
          });

          await cleanupAndFinalize('failed', disconnectError);
        }
      });
    } catch (syncErr: any) {
      this.logger.error(`Lỗi khi khởi tạo Job [${jobId}]: ${syncErr.message}`);
      this.redisPubSub.publishEvent({
        type: 'JOB_FAILED',
        jobId,
        pluginId,
        pipeline,
        timestamp: Date.now(),
        data: { error: syncErr.message },
      });
      await cleanupAndFinalize('failed', syncErr.message);
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
    timeline: any[],
    tokenUsage: any,
    error?: any
  ) {
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
    } catch (err: any) {
      this.logger.error(`Không thể lưu AgentExecLog cho Job [${jobId}]: ${err.message}`);
    }
  }
}
