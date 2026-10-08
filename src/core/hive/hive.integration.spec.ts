import { ConfigService } from '@nestjs/config';
import { HiveService } from './hive.service';
import { IdentifiedKeywordListSchema } from '../../plugins/story-shadowing/story-shadowing.schema';
import { KeywordIdentifierNode } from '../../plugins/story-shadowing/nodes/keyword-identifier.node';
import { StoryShadowingStateType } from '../../plugins/story-shadowing/story-shadowing.state';
import * as dotenv from 'dotenv';

dotenv.config();

describe('HiveService Live Integration & Node Pluggability', () => {
  let hiveService: HiveService;

  beforeAll(() => {
    if (!process.env.HIVE_API_KEY) {
      console.warn('⚠️ Bỏ qua Live Integration vì thiếu HIVE_API_KEY');
      return;
    }
    const mockConfig = {
      get: (key: string, defaultValue?: any) => {
        if (key === 'HIVE_API_KEY') return process.env.HIVE_API_KEY;
        if (key === 'HIVE_MODEL') return 'zai-org/glm-5.3-flash';
        if (key === 'HIVE_BASE_URL') return 'https://api.thehive.ai/api/v3';
        return defaultValue;
      },
    } as unknown as ConfigService;

    hiveService = new HiveService(mockConfig);
    hiveService.onModuleInit();
  });

  it('should call live Hive API with invokeStructured using Zod schema', async () => {
    if (!process.env.HIVE_API_KEY) return;

    const response = await hiveService.invokeStructured(
      IdentifiedKeywordListSchema,
      'Extract difficult keywords: "Artificial intelligence empowers researchers to break new ground and tackle insurmountable problems."'
    );

    expect(response.parsed).toBeDefined();
    expect(response.parsed.items).toBeInstanceOf(Array);
    expect(response.parsed.items.length).toBeGreaterThan(0);
    expect(response.usage.totalTokens).toBeGreaterThan(0);

    const first = response.parsed.items[0];
    expect(first.word).toBeDefined();
    expect(['word', 'idiom', 'phrasal_verb']).toContain(first.type);
    expect(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']).toContain(first.level);
  }, 45000);

  it('should demonstrate Node Pluggability: KeywordIdentifierNode works seamlessly when injected with HiveService', async () => {
    if (!process.env.HIVE_API_KEY) return;

    // Ép kiểu hiveService thành GeminiService (duck typing / Liskov Substitution Principle)
    const node = new KeywordIdentifierNode(hiveService as any);

    const mockState: Partial<StoryShadowingStateType> = {
      rawText: 'Technology evolves rapidly, making continuous adaptation crucial for survival.',
      sentences: [],
      identifiedKeywords: [],
      keywords: [],
    };

    const result = await node.invoke(mockState as any);

    expect(result.identifiedKeywords).toBeDefined();
    expect(result.identifiedKeywords!.length).toBeGreaterThan(0);
    expect(result.tokenUsage?.totalTokens).toBeGreaterThan(0);
  }, 45000);
});
