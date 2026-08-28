import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  Req,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBody,
  ApiResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { JobExecutionService } from './job-execution.service';

@ApiTags('Agents (Gateway)')
@Controller('v1/agents')
export class AgentsController {
  constructor(
    private readonly pluginRegistry: PluginRegistryService,
    private readonly jobExecutionService: JobExecutionService,
  ) { }

  /**
   * Lấy danh sách toàn bộ các plugins đang hoạt động
   */
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các Agents Plugin' })
  async listPlugins() {
    return Array.from(this.pluginRegistry['plugins'].values()).map(
      (p) => p.metadata,
    );
  }

  /**
   * API Khởi chạy Pipeline (Server-Sent Events)
   */
  @Post(':pluginId/:pipeline/stream')
  @ApiOperation({
    summary: 'Khởi chạy một Agent Pipeline và nhận luồng dữ liệu SSE',
  })
  @ApiParam({
    name: 'pluginId',
    example: 'story-shadowing',
    description: 'Tên của Plugin',
  })
  @ApiParam({
    name: 'pipeline',
    example: 'youtube',
    description: 'Loại pipeline cần thực thi (vd: text, youtube)',
  })
  @ApiBody({
    description:
      'Dữ liệu đầu vào phụ thuộc vào pipeline. \n- Với text: { "text": "Đoạn văn...", "voice": "FEMALE" } \n- Với youtube: { "youtubeUrl": "https..." }',
    schema: {
      type: 'object',
      properties: {
        youtubeUrl: {
          type: 'string',
          example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'SSE Stream Connection Opened.' })
  @HttpCode(200)
  async executeAgentStream(
    @Param('pluginId') pluginId: string,
    @Param('pipeline') pipeline: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    return this.jobExecutionService.executeAgentStream(
      pluginId,
      pipeline,
      body,
      req,
      res,
    );
  }
}
