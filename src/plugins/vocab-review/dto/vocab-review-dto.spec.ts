import 'reflect-metadata';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ReviewSessionQueryDto } from './review-session-query.dto';
import { SubmitReviewDto } from './submit-review.dto';

describe('Vocab Review DTOs Validation', () => {
  describe('ReviewSessionQueryDto', () => {
    it('should validate valid query parameters', async () => {
      const dto = plainToInstance(ReviewSessionQueryDto, { limit: 15, practiceAll: false });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should clamp or reject limit outside 1 to 30', async () => {
      const dto = plainToInstance(ReviewSessionQueryDto, { limit: 50 });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('SubmitReviewDto', () => {
    it('should pass with valid cardId, isCorrect and responseTimeMs', async () => {
      const dto = plainToInstance(SubmitReviewDto, {
        cardId: '670a1b2c3d4e5f6a7b8c9d0e',
        isCorrect: true,
        responseTimeMs: 2500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBe(0);
    });

    it('should fail with empty cardId', async () => {
      const dto = plainToInstance(SubmitReviewDto, {
        cardId: '',
        isCorrect: true,
        responseTimeMs: 2500,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });
  });
});
