import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { z } from 'zod';
import { Readable } from 'stream';
import { HiveService } from './hive.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HiveService', () => {
  let service: HiveService;
  let configService: ConfigService;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    mockAxiosInstance = {
      post: jest.fn(),
    };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HiveService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'HIVE_API_KEY') return 'test-key';
              if (key === 'HIVE_MODEL') return 'zai-org/glm-5.3-flash';
              if (key === 'HIVE_BASE_URL') return 'https://api.thehive.ai/api/v3';
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<HiveService>(HiveService);
    configService = module.get<ConfigService>(ConfigService);
    service.onModuleInit();
    jest.clearAllMocks();
  });

  describe('invoke', () => {
    it('should send request and return text with usage', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'Hello world',
                reasoning: 'Need to say hello',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
            total_tokens: 30,
            completion_tokens_details: { reasoning_tokens: 15 },
          },
        },
      });

      const result = await service.invoke([
        { role: 'user', content: 'Say hello' },
      ]);

      expect(result.text).toBe('Hello world');
      expect(result.usage.totalTokens).toBe(30);
      expect(result.reasoning).toBe('Need to say hello');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('invokeStructured', () => {
    const TestSchema = z.object({
      greeting: z.string(),
      count: z.number(),
    });

    it('should validate structured json response using zod', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ greeting: 'Xin chào', count: 5 }),
              },
            },
          ],
          usage: {
            prompt_tokens: 15,
            completion_tokens: 25,
            total_tokens: 40,
          },
        },
      });

      const result = await service.invokeStructured(
        TestSchema,
        'Generate greeting'
      );

      expect(result.parsed).toEqual({ greeting: 'Xin chào', count: 5 });
      expect(result.usage.promptTokens).toBe(15);
    });

    it('should clean markdown backticks from json response if present', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: '```json\n{"greeting": "Chao bạn", "count": 2}\n```',
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 10,
            total_tokens: 20,
          },
        },
      });

      const result = await service.invokeStructured(
        TestSchema,
        'Generate greeting'
      );

      expect(result.parsed).toEqual({ greeting: 'Chao bạn', count: 2 });
    });

    it('should throw Error if model returns invalid JSON', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: 'Not a JSON text',
              },
            },
          ],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        },
      });

      await expect(
        service.invokeStructured(TestSchema, 'Generate invalid')
      ).rejects.toThrow('Hive API returned invalid JSON');
    });
  });

  describe('invokeStream', () => {
    it('should stream chunks including reasoning and content', async () => {
      const sseStream = new Readable({
        read() {},
      });

      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: sseStream,
      });

      const generator = service.invokeStream([
        { role: 'user', content: 'Stream test' },
      ]);

      process.nextTick(() => {
        sseStream.push('data: {"choices":[{"delta":{"reasoning":"thinking"}}]}\n\n');
        sseStream.push('data: {"choices":[{"delta":{"content":"result"}}]}\n\n');
        sseStream.push('data: [DONE]\n\n');
        sseStream.push(null);
      });

      const chunks = [];
      for await (const chunk of generator) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      expect(chunks[0].reasoning).toBe('thinking');
      expect(chunks[1].content).toBe('result');
      expect(chunks[chunks.length - 1].isDone).toBe(true);
    });
  });
});
