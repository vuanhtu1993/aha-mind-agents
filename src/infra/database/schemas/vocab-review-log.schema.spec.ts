import { VocabReviewLogSchema } from './vocab-review-log.schema';

describe('VocabReviewLogSchema', () => {
  it('should define required fields for review log correctly', () => {
    const paths = VocabReviewLogSchema.paths;
    expect(paths['vocabCardId']).toBeDefined();
    expect(paths['vocabCardId'].isRequired).toBeTruthy();
    expect(paths['word']).toBeDefined();
    expect(paths['rating']).toBeDefined();
    expect(paths['isCorrect']).toBeDefined();
    expect(paths['reviewedAt']).toBeDefined();
  });
});
