import { QuestionFormulatorNode } from './question-formulator.node';
import { GeminiService } from '../../../core/gemini/gemini.service';

describe('QuestionFormulatorNode', () => {
  let node: QuestionFormulatorNode;
  let mockGeminiService: Partial<GeminiService>;

  beforeEach(() => {
    mockGeminiService = {
      invokeStructured: jest.fn(),
    };
    node = new QuestionFormulatorNode(mockGeminiService as GeminiService);
  });

  it('should formulate debate question matching topic and level', async () => {
    const mockStructuredResult = {
      parsed: {
        topic: 'AI in Education',
        question: 'Should artificial intelligence replace traditional teachers in evaluating student essays?',
      },
      usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165 },
    };
    (mockGeminiService.invokeStructured as jest.Mock).mockResolvedValue(mockStructuredResult);

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
    (mockGeminiService.invokeStructured as jest.Mock).mockRejectedValue(
      new Error('Gemini API Rate Limit Exceeded'),
    );

    const result = await node.invoke({
      resolvedTopic: 'AI in Education',
      sourceContentSummary: 'Content summary',
      level: 'B2',
    } as any);

    expect(result.error).toContain('Không thể tạo câu hỏi tranh luận');
  });
});
