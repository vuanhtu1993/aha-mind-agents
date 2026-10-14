import { YoutubeSentenceConsolidatorNode } from './youtube-sentence-consolidator.node';
import { HiveService } from 'src/core/hive/hive.service';
import { PhoneticService } from 'src/core/phonetics/phonetic.service';

describe('YoutubeSentenceConsolidatorNode', () => {
  let node: YoutubeSentenceConsolidatorNode;
  let mockHiveService: Partial<HiveService>;
  let mockPhoneticsService: Partial<PhoneticService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn(),
    };
    mockPhoneticsService = {
      ensureInitialized: jest.fn().mockResolvedValue(undefined),
      transcribeSentence: jest.fn().mockReturnValue([{ word: 'Hello', ipa: '/test/' }]),
    };
    node = new YoutubeSentenceConsolidatorNode(
      mockHiveService as HiveService,
      mockPhoneticsService as PhoneticService,
    );
  });

  it('should consolidate youtube subtitles and compute phonetic transcriptions', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValueOnce({
      parsed: {
        level: 'easy',
        sentences: [
          {
            id: 0,
            text: 'Hello world.',
            startMs: 0,
            endMs: 3000,
          },
        ],
      },
      usage: { promptTokens: 50, completionTokens: 30, totalTokens: 80 },
    });

    const state: any = {
      youtubeTranscript: [
        { text: 'Hello', offset: 1000, duration: 1500 },
        { text: 'world.', offset: 2500, duration: 1500 },
      ],
    };

    const result = await node.invoke(state);

    expect(result.level).toBe('easy');
    expect(result.rawSentences).toHaveLength(1);
    const firstSentence = result.rawSentences?.[0] as any;
    expect(firstSentence.startMs).toBe(1000); // 0 + timeOffset (1000)
    expect(firstSentence.endMs).toBe(4000); // 3000 + timeOffset (1000)
    expect(firstSentence.words[0].ipa).toBe('/test/');
  });

  it('should respect custom nodeOverrides for model, temperature, maxTokens, and systemPrompt', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValueOnce({
      parsed: {
        level: 'hard',
        sentences: [
          {
            id: 0,
            text: 'Custom prompt sentence.',
            startMs: 0,
            endMs: 2000,
          },
        ],
      },
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const state: any = {
      youtubeTranscript: [
        { text: 'Custom prompt', offset: 0, duration: 2000 },
      ],
      config: {
        defaultModel: 'global-model',
        nodeOverrides: {
          youtubeConsolidator: {
            model: 'deepseek-v4.1-flash',
            temperature: 0.2,
            maxTokens: 16384,
            systemPrompt: 'Custom YouTube Consolidator Prompt',
          },
        },
      },
    };

    await node.invoke(state);

    expect(mockHiveService.invokeStructured).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: 'Custom YouTube Consolidator Prompt',
        }),
      ]),
      expect.objectContaining({
        model: 'deepseek-v4.1-flash',
        temperature: 0.2,
        maxTokens: 16384,
      }),
    );
  });
});
