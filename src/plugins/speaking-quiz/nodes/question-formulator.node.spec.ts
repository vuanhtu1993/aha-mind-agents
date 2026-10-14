import { QuestionFormulatorNode } from './question-formulator.node';
import { HiveService } from 'src/core/hive/hive.service';

describe('QuestionFormulatorNode', () => {
  let node: QuestionFormulatorNode;
  let mockHiveService: Partial<HiveService>;

  beforeEach(() => {
    mockHiveService = {
      invokeStructured: jest.fn(),
    };
    node = new QuestionFormulatorNode(mockHiveService as HiveService);
  });

  it('should formulate debate question matching topic and level', async () => {
    const mockStructuredResult = {
      parsed: {
        topic: 'AI in Education',
        question: 'Should artificial intelligence replace traditional teachers in evaluating student essays?',
      },
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    };
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValue(mockStructuredResult);

    const result = await node.invoke({
      resolvedTopic: 'AI in Education',
      sourceContentSummary: 'Discussion regarding automated grading software in schools.',
      level: 'B2',
      targetKeywords: [{ word: 'evaluate', meaning: 'assess' }],
    } as any);

    expect(result.generatedQuestion).toBe(
      'Should artificial intelligence replace traditional teachers in evaluating student essays?',
    );
    expect(result.tokenUsage?.totalTokens).toBe(165);
    expect(result.error).toBeUndefined();
  });

  it('should return error when LLM invocation fails', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockRejectedValue(
      new Error('Hive API Error'),
    );

    const result = await node.invoke({
      resolvedTopic: 'AI in Education',
      sourceContentSummary: 'Content summary',
      level: 'B2',
    } as any);

    expect(result.error).toContain('Không thể tạo câu hỏi luyện nói');
  });

  it('should respect custom nodeOverrides for model, temperature, maxTokens, and systemPrompt', async () => {
    (mockHiveService.invokeStructured as jest.Mock).mockResolvedValueOnce({
      parsed: {
        question: 'Should schools ban smartphones?',
        suggestedFramework: 'PREP',
      },
      usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
    });

    const state: any = {
      resolvedTopic: 'Smartphones in School',
      level: 'B2',
      config: {
        defaultModel: 'global-fallback-model',
        nodeOverrides: {
          questionFormulator: {
            model: 'deepseek-v4.1-flash',
            temperature: 0.7,
            maxTokens: 2048,
            systemPrompt: 'Custom pedagogical instructions for {LEVEL}',
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
          content: expect.stringContaining('Custom pedagogical instructions for B2'),
        }),
      ]),
      expect.objectContaining({
        model: 'deepseek-v4.1-flash',
        temperature: 0.7,
        maxTokens: 2048,
      }),
    );
  });
});
