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

  it('should synthesize adaptive scaffold and map to legacy prepScaffold', async () => {
    const mockAdaptiveOutput = {
      parsed: {
        frameworkType: 'PAR',
        frameworkName: 'PAR (Problem - Advice - Result)',
        frameworkDescription: 'Khung giải pháp và lời khuyên',
        topicCollocations: [
          { phrase: 'remote burn-out', meaning: 'Kiệt sức khi làm từ xa' },
          { phrase: 'work-life boundaries', meaning: 'Ranh giới công việc và cuộc sống' },
        ],
        stages: {
          stage1: {
            stageKey: 'problem',
            title: 'Problem Identification',
            signposts: ['The core challenge is', 'From what I observe'],
            hint: 'Nêu thực trạng kiệt sức',
            modelAnswer: 'The core challenge is remote burn-out caused by blurred boundaries.',
          },
          stage2: {
            stageKey: 'advice',
            title: 'Actionable Advice',
            signposts: ['My recommendation is', 'Leaders should'],
            hint: 'Đưa ra lời khuyên thiết lập ranh giới',
            modelAnswer: 'Leaders should establish clear work-life boundaries after hours.',
          },
          stage3: {
            stageKey: 'alternative',
            title: 'Alternative Solution',
            signposts: ['Additionally', 'Another practical step is'],
            hint: 'Khuyến khích nghỉ ngơi',
            modelAnswer: 'Additionally, companies should offer regular digital detox sessions.',
          },
          stage4: {
            stageKey: 'result',
            title: 'Expected Outcome',
            signposts: ['Ultimately', 'This ensures that'],
            hint: 'Đúc kết lợi ích lâu dài',
            modelAnswer: 'Ultimately, this ensures that employees remain engaged and productive.',
          },
        },
      },
      usage: { promptTokens: 300, completionTokens: 180, totalTokens: 480 },
    };
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValue(mockAdaptiveOutput);

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'How can managers prevent burnout in remote teams?',
      level: 'B2',
      targetKeywords: [{ word: 'burnout', meaning: 'exhaustion' }],
    } as any);

    expect(result.adaptiveScaffold).toBeDefined();
    expect(result.adaptiveScaffold?.frameworkType).toBe('PAR');
    expect(result.adaptiveScaffold?.topicCollocations).toHaveLength(2);
    // Backward compatibility check
    expect(result.prepScaffold).toBeDefined();
    expect(result.prepScaffold?.point.title).toBe('Problem Identification');
    expect(result.prepScaffold?.conclusion.title).toBe('Expected Outcome');
    expect(result.tokenUsage?.totalTokens).toBe(480);
    expect(result.error).toBeUndefined();
  });

  it('should retry when initial synthesis returns invalid schema', async () => {
    (mockHiveService.invokeStructured as jest.Mock)
      .mockRejectedValueOnce(new Error('Validation error: missing conclusion'))
      .mockResolvedValueOnce({
        parsed: {
          frameworkType: 'PREP',
          frameworkName: 'PREP (Point - Reason - Example - Point)',
          frameworkDescription: 'Khung quan điểm và lập luận',
          topicCollocations: [
            { phrase: 'remote work', meaning: 'làm việc từ xa' },
            { phrase: 'boost productivity', meaning: 'tăng năng suất' },
          ],
          stages: {
            stage1: { stageKey: 'point', title: 'Point', signposts: ['P1', 'P2'], hint: 'H1', modelAnswer: 'M1' },
            stage2: { stageKey: 'reason', title: 'Reason', signposts: ['R1', 'R2'], hint: 'H2', modelAnswer: 'M2' },
            stage3: { stageKey: 'example', title: 'Example', signposts: ['E1', 'E2'], hint: 'H3', modelAnswer: 'M3' },
            stage4: { stageKey: 'conclusion', title: 'Conclusion', signposts: ['C1', 'C2'], hint: 'H4', modelAnswer: 'M4' },
          },
        },
        usage: { promptTokens: 200, completionTokens: 100, totalTokens: 300 },
      });

    const result = await node.invoke({
      resolvedTopic: 'Remote Work',
      generatedQuestion: 'Does remote work boost productivity?',
      level: 'B2',
      targetKeywords: [],
    } as any);

    expect(result.adaptiveScaffold?.frameworkType).toBe('PREP');
    expect(result.prepScaffold?.conclusion.title).toBe('Conclusion');
    expect(mockHiveService.invokeStructured).toHaveBeenCalledTimes(2);
  });
});
