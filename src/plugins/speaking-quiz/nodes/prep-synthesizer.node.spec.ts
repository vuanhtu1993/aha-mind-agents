import { PrepSynthesizerNode } from './prep-synthesizer.node';
import { HiveService } from 'src/core/hive/hive.service';

describe('PrepSynthesizerNode', () => {
  let node: PrepSynthesizerNode;
  let mockHiveService: Partial<HiveService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn(),
    };
    node = new PrepSynthesizerNode(mockHiveService as HiveService);
  });

  it('should synthesize PREP scaffold containing all 4 stages', async () => {
    const mockPrepOutput = {
      parsed: {
        point: {
          title: 'Point',
          signposts: ['From my perspective', 'I strongly believe that'],
          hint: 'Express your stance directly and concisely.',
          modelAnswer: 'From my perspective, remote work increases productivity when managed well.',
        },
        reason: {
          title: 'Reason',
          signposts: ['This is primarily because', 'The core justification is'],
          hint: 'Explain the underlying reason using the keyword.',
          modelAnswer: 'This is primarily because employees avoid commute fatigue.',
        },
        example: {
          title: 'Example',
          signposts: ['For instance', 'A notable example is'],
          hint: 'Give an illustrative real-world scenario.',
          modelAnswer: 'For instance, many tech companies saw output jump during hybrid setups.',
        },
        conclusion: {
          title: 'Conclusion',
          signposts: ['In summary', 'Ultimately'],
          hint: 'Reiterate your opening point with conviction.',
          modelAnswer: 'In summary, flexibility is indispensable for modern organizations.',
        },
      },
      usage: { promptTokens: 300, completionTokens: 180, totalTokens: 480 },
    };
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValue(mockPrepOutput);

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'Does remote work boost productivity?',
      level: 'B2',
      targetKeywords: [{ word: 'productivity', meaning: 'efficiency' }],
    } as any);

    expect(result.prepScaffold).toBeDefined();
    expect(result.prepScaffold?.point.signposts).toHaveLength(2);
    expect(result.prepScaffold?.conclusion.title).toBe('Conclusion');
    expect(result.tokenUsage?.totalTokens).toBe(480);
    expect(result.error).toBeUndefined();
  });

  it('should retry when initial synthesis returns invalid schema', async () => {
    (mockHiveService.invokeStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('Validation error: missing conclusion'))
      .mockResolvedValueOnce({
        parsed: {
          point: { title: 'Point', signposts: ['P1', 'P2'], hint: 'H1', modelAnswer: 'M1' },
          reason: { title: 'Reason', signposts: ['R1', 'R2'], hint: 'H2', modelAnswer: 'M2' },
          example: { title: 'Example', signposts: ['E1', 'E2'], hint: 'H3', modelAnswer: 'M3' },
          conclusion: { title: 'Conclusion', signposts: ['C1', 'C2'], hint: 'H4', modelAnswer: 'M4' },
        },
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'Does remote work boost productivity?',
      level: 'B2',
      targetKeywords: [],
    } as any);

    expect(result.prepScaffold?.conclusion.title).toBe('Conclusion');
    expect(mockHiveService.invokeStructured).toHaveBeenCalledTimes(2);
  });
});
