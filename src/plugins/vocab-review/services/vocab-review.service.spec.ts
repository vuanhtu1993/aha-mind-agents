import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { VocabReviewService } from './vocab-review.service';
import { FSRSService } from './fsrs.service';
import { DistractorService } from './distractor.service';
import { VocabCard } from '../../../infra/database/schemas/vocab-card.schema';
import { VocabReviewLog } from '../../../infra/database/schemas/vocab-review-log.schema';
import { Storybook } from '../../../infra/database/schemas/storybook.schema';
import { AHA_TOOLS_CONNECTION } from '../../../infra/database/database.constants';

describe('VocabReviewService', () => {
  let service: VocabReviewService;
  let mockVocabCardModel: any;
  let mockReviewLogModel: any;
  let mockStorybookModel: any;

  beforeEach(async () => {
    mockVocabCardModel = {
      find: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
    };
    mockReviewLogModel = {
      create: jest.fn(),
    };
    mockStorybookModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabReviewService,
        FSRSService,
        DistractorService,
        {
          provide: getModelToken(VocabCard.name, AHA_TOOLS_CONNECTION),
          useValue: mockVocabCardModel,
        },
        {
          provide: getModelToken(VocabReviewLog.name, AHA_TOOLS_CONNECTION),
          useValue: mockReviewLogModel,
        },
        {
          provide: getModelToken(Storybook.name, AHA_TOOLS_CONNECTION),
          useValue: mockStorybookModel,
        },
      ],
    }).compile();

    service = module.get<VocabReviewService>(VocabReviewService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getDueCount', () => {
    it('should aggregate dueCount, totalCount, newCount, masteredCount and learningCount', async () => {
      mockVocabCardModel.countDocuments
        .mockResolvedValueOnce(5) // dueCount
        .mockResolvedValueOnce(20) // totalCount
        .mockResolvedValueOnce(3) // newCount
        .mockResolvedValueOnce(7); // masteredCount

      const result = await service.getDueCount();

      expect(result.dueCount).toBe(5);
      expect(result.totalCount).toBe(20);
      expect(result.newCount).toBe(3);
      expect(result.masteredCount).toBe(7);
      expect(result.learningCount).toBe(10); // 20 - 3 - 7
    });
  });

  describe('getCandidateDueVocab', () => {
    it('should return prioritized candidate vocabulary cards with correct srsStatus', async () => {
      const mockCards = [
        {
          _id: 'card1',
          word: 'sustainable',
          explanation: 'Able to be maintained at a certain rate',
          level: 'B2',
          fsrs: { due: new Date(Date.now() - 10000), stability: 1.2, reps: 3 },
        },
        {
          _id: 'card2',
          word: 'mitigate',
          explanation: 'Make less severe',
          level: 'C1',
          fsrs: { due: new Date(Date.now() + 50000), stability: 0.8, reps: 1 },
        },
      ];

      mockVocabCardModel.find
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue(mockCards),
        })
        .mockReturnValueOnce({
          sort: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          lean: jest.fn().mockResolvedValue([]),
        });

      const candidates = await service.getCandidateDueVocab({ limit: 4 });

      expect(candidates).toHaveLength(2);
      expect(candidates[0].word).toBe('sustainable');
      expect(candidates[0].srsStatus).toBe('due');
      expect(candidates[1].word).toBe('mitigate');
      expect(candidates[1].srsStatus).toBe('learning');
    });
  });

  describe('submitReview', () => {
    it('should submit review, update card fsrs and insert log', async () => {
      const mockCard = {
        _id: 'card123',
        word: 'diligent',
        fsrs: {
          due: new Date(),
          stability: 1.0,
          difficulty: 5.0,
          state: 1,
          reps: 1,
          lapses: 0,
        },
        save: jest.fn().mockResolvedValue(true),
      };

      mockVocabCardModel.findById.mockResolvedValue(mockCard);
      mockReviewLogModel.create.mockResolvedValue({ _id: 'log123' });

      const result = await service.submitReview({
        cardId: 'card123',
        isCorrect: true,
        responseTimeMs: 2500,
      });

      expect(result.success).toBe(true);
      expect(result.cardId).toBe('card123');
      expect(result.rating).toBe(4); // Easy (< 3000ms)
      expect(mockCard.save).toHaveBeenCalled();
      expect(mockReviewLogModel.create).toHaveBeenCalled();
    });
  });
});
