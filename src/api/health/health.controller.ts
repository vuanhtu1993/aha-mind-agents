import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

/**
 * HealthController cung cấp endpoint giám sát trạng thái hoạt động (Liveness Probe)
 * của hệ thống aha-mind-agents, phục vụ Gateway, Docker và Uptime Robot.
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Kiểm tra trạng thái máy chủ API Gateway' })
  @ApiResponse({ status: 200, description: 'Hệ thống đang hoạt động bình thường.' })
  check() {
    return {
      status: 'ok',
      service: 'aha-mind-agents',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }
}
