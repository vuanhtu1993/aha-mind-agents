import { VocabCardSchema } from './vocab-card.schema';

describe('VocabCardSchema', () => {
  it('should define required fields correctly', () => {
    expect(VocabCardSchema.path('word')).toBeDefined();
    expect(VocabCardSchema.path('word').isRequired).toBeTruthy();
    expect(VocabCardSchema.path('explanation')).toBeDefined();
    expect(VocabCardSchema.path('explanation').isRequired).toBeTruthy();
    expect(VocabCardSchema.path('level')).toBeDefined();
    expect(VocabCardSchema.path('fsrs')).toBeDefined();
    expect(VocabCardSchema.path('fsrs.due')).toBeDefined();
    expect(VocabCardSchema.path('fsrs.stability')).toBeDefined();
    expect(VocabCardSchema.path('fsrs.difficulty')).toBeDefined();
    expect(VocabCardSchema.path('fsrs.state')).toBeDefined();
  });

  it('should have index on word and fsrs.due', () => {
    expect((VocabCardSchema.path('word') as any).options.index).toBeTruthy();
    expect((VocabCardSchema.path('fsrs.due') as any).options.index).toBeTruthy();
  });
});
