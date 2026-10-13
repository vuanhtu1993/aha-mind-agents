import { PersisterNode } from './persister.node';
import { Model } from 'mongoose';
import { SpeakingQuestion } from '../../../infra/database/schemas/speaking-question.schema';

describe('PersisterNode', () => {
  let node: PersisterNode;
  let mockSpeakingQuestionModel: any;

  beforeEach(() => {
    mockSpeakingQuestionModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: '67a8b9c0f123456789abcdef', ...dto }),
    }));
    node = new PersisterNode(mockSpeakingQuestionModel as unknown as Model<SpeakingQuestion>);
  });

  it('should persist valid speaking question into database', async () => {
    const state = {
      storybookId: '679c1a2b3c4d5e6f7a8b9c0d',
      resolvedTopic: 'AI in Education',
      generatedQuestion: 'Should AI grade student essays?',
      level: 'B2',
      targetKeywords: [{ word: 'evaluate', meaning: 'assess' }],
      prepScaffold: {
        point: { title: 'Point', signposts: ['In my view'], hint: 'State point', modelAnswer: 'Ans 1' },
        reason: { title: 'Reason', signposts: ['Because'], hint: 'State reason', modelAnswer: 'Ans 2' },
        example: { title: 'Example', signposts: ['For instance'], hint: 'State example', modelAnswer: 'Ans 3' },
        conclusion: { title: 'Conclusion', signposts: ['In sum'], hint: 'Conclude', modelAnswer: 'Ans 4' },
      },
    };

    const result = await node.invoke({
      ...state,
      adaptiveScaffold: {
        frameworkType: 'PAR',
        frameworkName: 'PAR (Problem - Advice - Result)',
        frameworkDescription: 'Khung lời khuyên',
        topicCollocations: [{ phrase: 'burnout', meaning: 'kiệt sức' }],
        stages: {
          stage1: { stageKey: 'problem', title: 'Problem', signposts: ['P1'], hint: 'H1', modelAnswer: 'M1' },
          stage2: { stageKey: 'advice', title: 'Advice', signposts: ['A1'], hint: 'H2', modelAnswer: 'M2' },
          stage3: { stageKey: 'alternative', title: 'Alt', signposts: ['Alt1'], hint: 'H3', modelAnswer: 'M3' },
          stage4: { stageKey: 'result', title: 'Result', signposts: ['R1'], hint: 'H4', modelAnswer: 'M4' },
        },
      },
    } as any);

    expect(result.persistedId).toBe('67a8b9c0f123456789abcdef');
    expect(result.error).toBeUndefined();
    expect(mockSpeakingQuestionModel).toHaveBeenCalledWith(
      expect.objectContaining({
        adaptiveScaffold: expect.objectContaining({
          frameworkType: 'PAR',
        }),
        targetKeywords: [
          expect.objectContaining({
            word: 'evaluate',
            meaning: 'assess',
            srsStatus: undefined,
            isInjected: false,
          }),
        ],
      }),
    );
  });

  it('should return error when mandatory state data is missing', async () => {
    const invalidState = {
      resolvedTopic: 'AI in Education',
      // Missing generatedQuestion and prepScaffold
    };

    const result = await node.invoke(invalidState as any);

    expect(result.error).toContain('Dữ liệu không đầy đủ');
  });
});
