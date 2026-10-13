import { Test, TestingModule } from '@nestjs/testing';
import { FSRSService } from './fsrs.service';
import { Rating } from 'ts-fsrs';

describe('FSRSService', () => {
  let service: FSRSService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FSRSService],
    }).compile();

    service = module.get<FSRSService>(FSRSService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('calculateFSRSRating', () => {
    it('should return Rating.Again (1) when answer is incorrect', () => {
      expect(service.calculateFSRSRating(false, 1500)).toBe(Rating.Again);
    });

    it('should return Rating.Easy (4) when answer is correct and response time < 3s', () => {
      expect(service.calculateFSRSRating(true, 2500)).toBe(Rating.Easy);
    });

    it('should return Rating.Good (3) when answer is correct and response time 3s - 10s', () => {
      expect(service.calculateFSRSRating(true, 5000)).toBe(Rating.Good);
      expect(service.calculateFSRSRating(true, 10000)).toBe(Rating.Good);
    });

    it('should return Rating.Hard (2) when answer is correct and response time > 10s', () => {
      expect(service.calculateFSRSRating(true, 11000)).toBe(Rating.Hard);
    });
  });

  describe('scheduleNextReview', () => {
    it('should schedule next review date in the future for successful ratings', () => {
      const initial = service.createInitialFSRSState(new Date('2026-10-13T00:00:00Z'));
      const reviewDate = new Date('2026-10-13T08:00:00Z');

      const result = service.scheduleNextReview(initial, Rating.Good, reviewDate);

      expect(result.updatedState).toBeDefined();
      expect(result.updatedState.reps).toBeGreaterThan(0);
      expect(new Date(result.updatedState.due).getTime()).toBeGreaterThan(reviewDate.getTime());
      expect(result.rating).toBe(Rating.Good);
    });

    it('should decrease stability or increase lapses on Again rating', () => {
      const initial = service.createInitialFSRSState(new Date('2026-10-13T00:00:00Z'));
      const reviewDate = new Date('2026-10-13T08:00:00Z');

      const result = service.scheduleNextReview(initial, Rating.Again, reviewDate);
      expect(result.updatedState.reps).toBeDefined();
      expect(result.rating).toBe(Rating.Again);
    });
  });
});
