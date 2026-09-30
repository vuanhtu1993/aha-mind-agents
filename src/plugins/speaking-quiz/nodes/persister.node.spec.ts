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

    const result = await node.invoke(state as any);

    expect(result.persistedId).toBe('67a8b9c0f123456789abcdef');
    expect(result.error).toBeUndefined();
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
