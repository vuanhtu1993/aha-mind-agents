import { Test, TestingModule } from '@nestjs/testing';
import { DashboardService } from './dashboard.service';
import { PluginRegistryService } from '../../core/services/plugin-registry.service';
import { ActiveJobTrackerService } from '../../core/services/active-job-tracker.service';
import { getModelToken } from '@nestjs/mongoose';
import { AgentExecLog } from '../../infra/database/schemas/agent-log.schema';
import { AgentConfig } from '../../infra/database/schemas/agent-config.schema';
import { AHA_MIND_CONNECTION } from '../../infra/database/database.constants';

describe('DashboardService', () => {
  let service: DashboardService;
  let mockConfigModel: any;
  let mockPluginRegistry: any;

  beforeEach(async () => {
    mockConfigModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
    };

    mockPluginRegistry = {
      plugins: new Map([
        [
          'test-agent',
          {
            metadata: {
              id: 'test-agent',
              pipelines: [
                {
                  id: 'pipe1',
                  nodes: [
                    {
                      id: 'nodeA',
                      type: 'llm',
                      defaultConfig: {
                        model: 'gemini-3.5-flash',
                        temperature: 0.1,
                        maxTokens: 4096,
                      },
                    },
                    {
                      id: 'nodeB_new',
                      type: 'llm',
                      defaultConfig: {
                        model: 'deepseek-v4.1-flash',
                        temperature: 0.2,
                        maxTokens: 8192,
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        {
          provide: getModelToken(AgentExecLog.name, AHA_MIND_CONNECTION),
          useValue: {},
        },
        {
          provide: getModelToken(AgentConfig.name, AHA_MIND_CONNECTION),
          useValue: mockConfigModel,
        },
        {
          provide: PluginRegistryService,
          useValue: mockPluginRegistry,
        },
        {
          provide: ActiveJobTrackerService,
          useValue: { getActiveJobs: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
  });

  it('should deep-merge new node defaults into existing config without overwriting user overrides', async () => {
    // Giả lập DB đã có record với nodeA có custom systemPrompt nhưng chưa có maxTokens, và nodeB_new chưa có trong DB
    const existingConfig: any = {
      agentId: 'test-agent',
      defaultModel: 'custom-model',
      nodeOverrides: {
        nodeA: {
          systemPrompt: 'My custom prompt',
          temperature: 0.7,
        },
      },
      save: jest.fn().mockResolvedValue(true),
      markModified: jest.fn(),
    };

    mockConfigModel.findOne.mockResolvedValue(existingConfig);

    const result = await (service as any).syncAgentMetadata('test-agent');

    // Phải giữ nguyên customPrompt và temperature của người dùng ở nodeA, nhưng bổ sung maxTokens
    expect(existingConfig.nodeOverrides.nodeA.systemPrompt).toBe('My custom prompt');
    expect(existingConfig.nodeOverrides.nodeA.temperature).toBe(0.7);
    expect(existingConfig.nodeOverrides.nodeA.maxTokens).toBe(4096);
    // Bổ sung nodeB_new từ code vào DB
    expect(existingConfig.nodeOverrides.nodeB_new).toBeDefined();
    expect(existingConfig.nodeOverrides.nodeB_new.model).toBe('deepseek-v4.1-flash');
    expect(existingConfig.save).toHaveBeenCalled();
    expect(result.syncedCount).toBeGreaterThan(0);
  });
});
