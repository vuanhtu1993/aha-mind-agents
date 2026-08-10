import { Controller, Get, Post, Param, Body, Res, Req, HttpException, HttpStatus, Logger, Inject } from '@nestjs/common';
import { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiParam, ApiBody, ApiResponse } from '@nestjs/swagger';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { v4 as uuidv4 } from 'uuid';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';

@ApiTags('Agents (Gateway)')
@Controller('v1/agents')
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION) private readonly agentExecLogModel: Model<AgentExecLog>,
  ) { }

  /**
   * Lấy danh sách toàn bộ các plugins đang hoạt động
   */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách Plugins', description: 'Trả về toàn bộ Agent Plugins đang được đăng ký trong hệ thống.' })
  @ApiResponse({ status: 200, description: 'Lấy danh sách thành công.' })
  getAvailablePlugins() {
    return {
      success: true,
      data: this.pluginRegistry.getAvailablePlugins(),
    };
  }

  /**
   * Xử lý thực thi Agent Pipeline và trả về luồng SSE bằng phương thức POST.
   */
  @Post(':pluginId/:pipeline/stream')
  @ApiOperation({ summary: 'Thực thi Agent', description: 'Gửi yêu cầu tới Agent và nhận luồng dữ liệu tiến độ thời gian thực dạng SSE (Server-Sent Events).' })
  @ApiParam({ name: 'plugin', example: 'story-shadowing', description: 'Tên của Plugin' })
  @ApiParam({ name: 'pipeline', example: 'text', description: 'Loại pipeline cần thực thi (vd: text, youtube)' })
  @ApiBody({
    description: 'Dữ liệu đầu vào phụ thuộc vào pipeline. \n- Với text: { "text": "Đoạn văn...", "voice": "FEMALE" } \n- Với youtube: { "youtubeUrl": "https..." }',
    schema: {
      type: 'object',
      properties: {
        text: { type: 'string', example: 'Once upon a time...' },
        voice: { type: 'string', example: 'FEMALE' },
        youtubeUrl: { type: 'string', example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'SSE Stream Connection Opened.' })
  async executeAgentStream(
    @Param('pluginId') pluginId: string,
    @Param('pipeline') pipeline: string,
    @Body() body: any,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const plugin = this.pluginRegistry.getPlugin(pluginId); // Tự động ném 404 nếu không thấy
    const metadata = plugin.metadata;

    if (!metadata.pipelines.includes(pipeline)) {
      throw new HttpException(`Pipeline '${pipeline}' không tồn tại trong plugin '${pluginId}'. Các pipeline hợp lệ: ${metadata.pipelines.join(', ')}`, HttpStatus.BAD_REQUEST);
    }

    let validatedInput: any;
    try {
      validatedInput = await plugin.validateInput(pipeline, body);
    } catch (error: any) {
      throw new HttpException({
        message: 'Dữ liệu đầu vào không hợp lệ',
        error: error.message || error,
      }, HttpStatus.BAD_REQUEST);
    }

    // Thiết lập HTTP Headers chuẩn cho SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Quan trọng để vượt qua các bộ đệm (buffers) của nginx hoặc proxy
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const jobId = uuidv4();
    this.logger.log(`Bắt đầu chạy Job [${jobId}] cho Plugin: ${pluginId} | Pipeline: ${pipeline}`);

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
      log: (message: string, meta?: any) => {
        this.logger.log(`[Job ${jobId}] ${message} ${meta ? JSON.stringify(meta) : ''}`);
      }
    };

    // Kích hoạt Plugin
    const stream$ = plugin.execute(pipeline, validatedInput, context);

    // Các biến phụ trợ cho việc lưu Log
    const startTime = Date.now();
    let lastEventTime = startTime;
    const timeline: any[] = [];
    let finalTokenUsage: any = undefined;
    let finalStatus = 'running';
    let finalError: any = undefined;

    // Đăng ký nhận luồng sự kiện
    const subscription = stream$.subscribe({
      next: (event) => {
        writeSseEvent(event);
        
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
          finalStatus = 'completed';
        }
      },
      error: async (err) => {
        this.logger.error(`Job [${jobId}] Lỗi: ${err.message}`);
        finalStatus = 'failed';
        finalError = err.message;
        writeSseEvent({ status: 'failed', message: `Lỗi hệ thống: ${err.message}` });
        
        await this.saveAgentLog(jobId, pluginId, pipeline, startTime, finalStatus, timeline, finalTokenUsage, finalError);
        res.end();
      },
      complete: async () => {
        this.logger.log(`Job [${jobId}] Hoàn tất.`);
        if (finalStatus !== 'failed') finalStatus = 'completed';
        
        await this.saveAgentLog(jobId, pluginId, pipeline, startTime, finalStatus, timeline, finalTokenUsage, finalError);
        res.end();
      },
    });

    // Nếu Client (Trình duyệt) đóng trình duyệt hoặc hủy request đột ngột
    req.on('close', () => {
      if (!subscription.closed) {
        this.logger.warn(`Job [${jobId}] Client ngắt kết nối đột ngột. Hủy bỏ tiến trình Agent...`);
        subscription.unsubscribe();
      }
    });
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
