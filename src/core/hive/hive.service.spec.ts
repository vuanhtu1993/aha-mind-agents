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

    const ItemsSchema = z.object({
      items: z.array(
        z.object({
          greeting: z.string(),
          count: z.number(),
        })
      ),
    });

    it('should auto-heal when LLM returns an array directly instead of { items: [...] }', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify([{ greeting: 'Chào bạn', count: 3 }]),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        },
      });

      const result = await service.invokeStructured(ItemsSchema, 'Generate greetings');
      expect(result.parsed).toEqual({
        items: [{ greeting: 'Chào bạn', count: 3 }],
      });
    });

    it('should auto-heal when LLM wraps items under a different key like data or keywords', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              message: {
                content: JSON.stringify({ data: [{ greeting: 'Alo', count: 1 }] }),
              },
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        },
      });

      const result = await service.invokeStructured(ItemsSchema, 'Generate greetings');
      expect(result.parsed).toEqual({
        items: [{ greeting: 'Alo', count: 1 }],
      });
    });

    it('should throw descriptive error when reasoning token limit is exceeded', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'length',
              message: {
                content: null,
                reasoning: 'Thinking too long...',
              },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 4096, total_tokens: 4196 },
        },
      });

      await expect(
        service.invokeStructured(ItemsSchema, 'Task too large')
      ).rejects.toThrow('Hive reasoning model token limit exceeded');
    });

    it('should throw descriptive error when finish_reason is length even with partial content', async () => {
      const truncatedJson = `{
  "items": [
    {
      "greeting": "Xin chào",
      "count": 1
    },
    {
      "greeting": "Hello",
      "cou`;

      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [
            {
              finish_reason: 'length',
              message: {
                content: truncatedJson,
                reasoning: 'Detailed reasoning...',
              },
            },
          ],
          usage: { prompt_tokens: 50, completion_tokens: 4096, total_tokens: 4146 },
        },
      });

      await expect(
        service.invokeStructured(ItemsSchema, 'Extract items')
      ).rejects.toThrow('Hive reasoning model token limit exceeded');
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

  describe('Token Bucket Rate Limiting (5 req/s) & Retries', () => {
    it('should throttle requests to max 5 requests per second', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        status: 200,
        data: {
          choices: [{ message: { content: 'OK' } }],
          usage: { total_tokens: 10 },
        },
      });

      const startTime = Date.now();
      // Bắn liên tiếp 6 requests
      const promises = Array.from({ length: 6 }).map((_, i) =>
        service.invoke([{ role: 'user', content: `test ${i}` }])
      );

      await Promise.all(promises);
      const elapsed = Date.now() - startTime;

      // Với Token Bucket capacity = 5 và refill 1 token mỗi 200ms:
      // 5 requests đầu bắn burst ngay lập tức, request thứ 6 phải chờ ít nhất ~180ms.
      expect(elapsed).toBeGreaterThanOrEqual(180);
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(6);
    });

    it('should retry on HTTP 429 and eventually succeed', async () => {
      mockAxiosInstance.post
        .mockRejectedValueOnce({
          response: { status: 429, data: { message: 'Too Many Requests' } },
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            choices: [{ message: { content: 'Recovered after rate limit' } }],
            usage: { total_tokens: 15 },
          },
        });

      const res = await service.invoke([{ role: 'user', content: 'test retry' }]);
      expect(res.text).toBe('Recovered after rate limit');
      expect(mockAxiosInstance.post).toHaveBeenCalledTimes(2);
    });

    it('should merge system prompts into a single system message for invokeStructured', async () => {
      mockAxiosInstance.post.mockResolvedValueOnce({
        status: 200,
        data: {
          choices: [{ message: { content: '{"status":"ok"}' }, finish_reason: 'stop' }],
          usage: { total_tokens: 20 },
        },
      });

      await service.invokeStructured(
        z.object({ status: z.string() }),
        [
          { role: 'system', content: 'Node custom instructions' },
          { role: 'user', content: 'Hello' },
        ],
        { maxTokens: 4096 }
      );

      const calledPayload = mockAxiosInstance.post.mock.calls[0][1];
      const systemMessages = calledPayload.messages.filter((m: any) => m.role === 'system');
      // Đảm bảo chỉ có duy nhất 1 system message ở đầu mảng messages
      expect(systemMessages.length).toBe(1);
      expect(systemMessages[0].content).toContain('Node custom instructions');
      expect(systemMessages[0].content).toContain('Target JSON Schema');
    });
  });
});
