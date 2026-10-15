import { YoutubeSentenceConsolidatorNode } from './youtube-sentence-consolidator.node';
import { HiveService } from 'src/core/hive/hive.service';
import { PhoneticService } from 'src/core/phonetics/phonetic.service';

describe('YoutubeSentenceConsolidatorNode', () => {
  let node: YoutubeSentenceConsolidatorNode;
  let mockHiveService: Partial<HiveService>;
  let mockPhoneticsService: Partial<PhoneticService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn().mockResolvedValue({
        parsed: { level: 'easy' },
        usage: { promptTokens: 30, completionTokens: 10, totalTokens: 40 },
      }),
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

  it('should consolidate youtube subtitles deterministically and assign IPA', async () => {
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
    expect(firstSentence.text).toBe('Hello world.');
    expect(firstSentence.startMs).toBe(1000);
    expect(firstSentence.endMs).toBe(4000);
    expect(firstSentence.words[0].ipa).toBe('/test/');
  });

  it('should gracefully fallback level to medium if AI classification fails', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockRejectedValueOnce(new Error('AI Service Busy'));

    const state: any = {
      youtubeTranscript: [
        { text: 'Testing fallback sentence.', offset: 0, duration: 2000 },
      ],
    };

    const result = await node.invoke(state);

    expect(result.level).toBe('medium');
    expect(result.rawSentences).toHaveLength(1);
    expect(result.rawSentences?.[0].text).toBe('Testing fallback sentence.');
  });
});
