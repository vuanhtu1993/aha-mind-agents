import { Test, TestingModule } from '@nestjs/testing';
import { DistractorService } from './distractor.service';

describe('DistractorService', () => {
  let service: DistractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DistractorService],
    }).compile();

    service = module.get<DistractorService>(DistractorService);
  });

  it('should generate 3 unique distractors not equal to the correct explanation', () => {
    const target = 'A practical method or technique used to solve a specific problem';
    const pool = [
      'To gradually become smaller, weaker, or less important over time',
      'The ability to understand something instinctively without needing conscious reasoning',
      'A standard or benchmark by which other things can be judged or measured',
      'A practical method or technique used to solve a specific problem', // trùng đáp án đúng
    ];

    const distractors = service.generateDistractors(target, 3, pool);

    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain(target);
    const unique = new Set(distractors.map((d: string) => d.toLowerCase()));
    expect(unique.size).toBe(3);
  });

  it('should fallback to default CEFR bank when pool has fewer than 3 items', () => {
    const target = 'Something special';
    const emptyPool: string[] = [];

    const distractors = service.generateDistractors(target, 3, emptyPool);

    expect(distractors).toHaveLength(3);
    expect(distractors).not.toContain(target);
  });
});
