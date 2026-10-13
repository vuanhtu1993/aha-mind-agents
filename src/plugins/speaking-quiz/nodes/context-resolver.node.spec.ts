import { ContextResolverNode } from './context-resolver.node';
import { Model } from 'mongoose';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { VocabReviewService } from '../../vocab-review/services/vocab-review.service';

describe('ContextResolverNode', () => {
  let node: ContextResolverNode;
  let mockStorybookModel: Partial<Model<Storybook>>;
  let mockVocabReviewService: Partial<VocabReviewService>;

  beforeEach(() => {
    mockStorybookModel = {
      findById: jest.fn(),
    };
    mockVocabReviewService = {
      getCandidateDueVocab: jest.fn().mockResolvedValue([
        {
          word: 'sustainable',
          explanation: 'Able to be maintained',
          level: 'B2',
          srsStatus: 'due',
        },
      ]),
    };
    node = new ContextResolverNode(
      mockStorybookModel as Model<Storybook>,
      mockVocabReviewService as VocabReviewService,
    );
  });

  it('should resolve storybook context with sentences, keywords and injected due vocab', async () => {
    const mockDoc = {
      _id: '679c1a2b3c4d5e6f7a8b9c0d',
      title: 'The Future of Renewable Energy',
      sentences: [
        { id: 1, text: 'Renewable energy is becoming increasingly vital.' },
        { id: 2, text: 'Solar panels harness sunlight efficiently.' },
      ],
      keywords: [
        { word: 'renewable', ipa: '/rɪˈnjuː.ə.bəl/', explanation: 'able to be renewed' },
        { word: 'harness', ipa: '/ˈhɑː.nəs/', explanation: 'control and make use of' },
      ],
      level: 'medium',
    };
    (mockStorybookModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockDoc),
    });

    const result = await node.invoke({
      storybookId: '679c1a2b3c4d5e6f7a8b9c0d',
      requestedLevel: 'B2',
    } as any);

    expect(result.resolvedTopic).toBe('The Future of Renewable Energy');
    expect(result.sourceContentSummary).toContain('Renewable energy');
    expect(result.targetKeywords?.length).toBeGreaterThanOrEqual(2);
    expect(result.level).toBe('B2');
    expect(result.error).toBeUndefined();
    // Candidate word 'sustainable' should be injected with srsStatus: 'due'
    expect(result.targetKeywords?.some(k => k.word === 'sustainable' && k.srsStatus === 'due')).toBeTruthy();
  });

  it('should return error when storybook is not found', async () => {
    (mockStorybookModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await node.invoke({
      storybookId: 'non-existing-id',
      requestedLevel: 'B2',
    } as any);

    expect(result.error).toContain('Storybook không tồn tại');
  });

  it('should resolve custom topic and inject due vocab into targetKeywords', async () => {
    const result = await node.invoke({
      customTopic: 'Work from Home Pros and Cons',
      requestedLevel: 'C1',
      customKeywords: ['productivity', 'isolation'],
    } as any);

    expect(result.resolvedTopic).toBe('Work from Home Pros and Cons');
    expect(result.level).toBe('C1');
    expect(result.targetKeywords?.length).toBeGreaterThanOrEqual(2);
    expect(result.targetKeywords?.some(k => k.word === 'sustainable' && k.srsStatus === 'due')).toBeTruthy();
  });
});
