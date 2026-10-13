import { Test, TestingModule } from '@nestjs/testing';
import { VocabReviewController } from './vocab-review.controller';
import { VocabReviewService } from './services/vocab-review.service';

describe('VocabReviewController', () => {
  let controller: VocabReviewController;
  let mockVocabReviewService: any;

  beforeEach(async () => {
    mockVocabReviewService = {
      getReviewSession: jest.fn().mockResolvedValue({ questions: [], totalDue: 0 }),
      submitReview: jest.fn().mockResolvedValue({ success: true, cardId: '123' }),
      getDueCount: jest.fn().mockResolvedValue({ dueCount: 5, totalCount: 20 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VocabReviewController],
      providers: [
        {
          provide: VocabReviewService,
          useValue: mockVocabReviewService,
        },
      ],
    }).compile();

    controller = module.get<VocabReviewController>(VocabReviewController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return review session', async () => {
    const result = await controller.getSession({ limit: 15, practiceAll: false });
    expect(mockVocabReviewService.getReviewSession).toHaveBeenCalledWith({
      limit: 15,
      practiceAll: false,
    });
    expect(result).toEqual({ questions: [], totalDue: 0 });
  });

  it('should submit review result', async () => {
    const dto = { cardId: '123', isCorrect: true, responseTimeMs: 2000 };
    const result = await controller.submitReview(dto);
    expect(mockVocabReviewService.submitReview).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ success: true, cardId: '123' });
  });

  it('should return due count stats', async () => {
    const result = await controller.getDueCount();
    expect(mockVocabReviewService.getDueCount).toHaveBeenCalled();
    expect(result).toEqual({ dueCount: 5, totalCount: 20 });
  });
});
