import { Controller, Get, Put, Param, Body, Query, Sse, MessageEvent } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam, ApiBody } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';
import { Observable, map } from 'rxjs';

@ApiTags('Dashboard (Admin)')
@Controller('v1/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly redisPubSub: RedisPubSubService
  ) { }

  @Sse('events')
  @ApiOperation({ summary: 'SSE Stream cho Dashboard (Real-time)', description: 'Lắng nghe các sự kiện job qua Redis Pub/Sub' })
  events(): Observable<MessageEvent> {
    return this.redisPubSub.events$.pipe(
      map((payload) => ({
        data: payload,
        type: payload.type,
      } as MessageEvent))
    );
  }

  @Get('metrics')
  @ApiOperation({ summary: 'Lấy thống kê hệ thống (Metrics)', description: 'Trả về tổng lượt chạy, tỉ lệ lỗi, và token usage trung bình' })
  async getMetrics() {
    return this.dashboardService.getMetrics();
  }

  @Get('logs')
  @ApiOperation({ summary: 'Xem lịch sử chạy Agent', description: 'Trả về danh sách log phân trang' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getLogs(
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 20,
  ) {
    return this.dashboardService.getLogs(Number(page), Number(limit));
  }

  @Get('plugins')
  @ApiOperation({ summary: 'Danh sách Plugins', description: 'Liệt kê các Agent Plugins đang kích hoạt' })
  async getPlugins() {
    return this.dashboardService.getPlugins();
  }

  @Get('configs/:agentId')
  @ApiOperation({ summary: 'Lấy cấu hình Agent', description: 'Lấy thông tin cấu hình (model, prompt, temperature) của một Agent cụ thể' })
  @ApiParam({ name: 'agentId', example: 'story-shadowing' })
  async getAgentConfig(@Param('agentId') agentId: string) {
    return this.dashboardService.getAgentConfig(agentId);
  }

  @Put('configs/:agentId')
  @ApiOperation({ summary: 'Cập nhật cấu hình Agent', description: 'Cập nhật model, prompt hoặc các tham số kỹ thuật khác' })
  @ApiParam({ name: 'agentId', example: 'story-shadowing' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        defaultModel: { type: 'string', example: 'gemini-3.5-flash' },
        systemPromptOverride: { type: 'string', example: 'Bạn là một chuyên gia...' },
        temperature: { type: 'number', example: 0.1 },
        isActive: { type: 'boolean', example: true }
      }
    }
  })
  async updateAgentConfig(
    @Param('agentId') agentId: string,
    @Body() body: Partial<AgentConfig>
  ) {
    return this.dashboardService.updateAgentConfig(agentId, body);
  }
}
