import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { ActiveJobTrackerService } from '../../core/services/active-job-tracker.service';

@Injectable()
export class DashboardService implements OnModuleInit {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectModel(AgentExecLog.name, AHA_MIND_CONNECTION) private readonly execLogModel: Model<AgentExecLog>,
    @InjectModel(AgentConfig.name, AHA_MIND_CONNECTION) private readonly configModel: Model<AgentConfig>,
    private readonly pluginRegistry: PluginRegistryService,
    private readonly activeJobTracker: ActiveJobTrackerService,
  ) { }

  async onModuleInit() {
    this.logger.log('Đang đồng bộ Metadata của các Plugin xuống AgentConfig...');
    const plugins = this.pluginRegistry['plugins'];

    for (const [agentId, plugin] of plugins.entries()) {
      const metadata = plugin.metadata;

      // Tạo một object chứa toàn bộ defaultConfig của các nodes
      const defaultNodeOverrides: Record<string, any> = {};

      if (metadata.pipelines && Array.isArray(metadata.pipelines)) {
        metadata.pipelines.forEach((pipeline: any) => {
          if (pipeline.nodes && Array.isArray(pipeline.nodes)) {
            pipeline.nodes.forEach((node: any) => {
              if (node.defaultConfig) {
                defaultNodeOverrides[node.id] = { ...node.defaultConfig };
              }
            });
          }
        });
      }

      // Upsert vào Database, nhưng CHỈ INSERT ($setOnInsert) nếu document chưa tồn tại, 
      // để không ghi đè lên các cấu hình mà Admin đã sửa trên Dashboard.
      await this.configModel.findOneAndUpdate(
        { agentId },
        {
          $setOnInsert: {
            agentId,
            defaultModel: 'gemini-3.5-flash',
            temperature: 0.1,
            maxRetries: 2,
            isActive: true,
            nodeOverrides: defaultNodeOverrides
          }
        },
        { upsert: true }
      );
    }

    this.logger.log('Đồng bộ Metadata hoàn tất.');
  }

  async getMetrics() {
    const totalRuns = await this.execLogModel.countDocuments();

    // Đếm số lượng theo status
    const statusCounts = await this.execLogModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    // Tính token và thời gian trung bình
    const averages = await this.execLogModel.aggregate([
      { $match: { status: 'completed' } },
      {
        $group: {
          _id: null,
          avgDuration: { $avg: '$durationMs' },
          totalTokensUsed: { $sum: '$tokenUsage.totalTokens' }
        }
      }
    ]);

    const statusMap = statusCounts.reduce((acc, curr) => {
      acc[curr._id] = curr.count;
      return acc;
    }, {});

    return {
      totalRuns,
      status: statusMap,
      averages: averages[0] ? {
        avgDurationMs: Math.round(averages[0].avgDuration),
        totalTokensUsed: averages[0].totalTokensUsed,
      } : null,
    };
  }

  async getLogs(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [dbLogs, total, activeJobs] = await Promise.all([
      this.execLogModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.execLogModel.countDocuments(),
      this.activeJobTracker.getActiveJobs(),
    ]);

    return {
      items: [...activeJobs, ...dbLogs],
      meta: {
        total: total + activeJobs.length,
        page,
        limit,
        totalPages: Math.ceil((total + activeJobs.length) / limit)
      }
    };
  }

  async getPlugins() {
    // Trả về danh sách plugin
    const plugins = this.pluginRegistry['plugins'];
    return Array.from(plugins.entries()).map(([id, plugin]) => ({
      id,
      metadata: plugin.metadata
    }));
  }

  async getAgentConfig(agentId: string) {
    const config = await this.configModel.findOne({ agentId }).lean();
    if (!config) {
      // Default config nếu chưa có
      return {
        agentId,
        defaultModel: 'gemini-3.5-flash',
        temperature: 0.1,
        maxRetries: 2,
        isActive: true
      };
    }
    return config;
  }

  async updateAgentConfig(agentId: string, data: Partial<AgentConfig>) {
    const config = await this.configModel.findOneAndUpdate(
      { agentId },
      { $set: data },
      { new: true, upsert: true }
    );
    return config;
  }
}
