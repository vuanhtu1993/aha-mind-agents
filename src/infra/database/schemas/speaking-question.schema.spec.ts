import { SpeakingQuestionSchema, SpeakingPrepScaffoldSchema } from './speaking-question.schema';

describe('SpeakingQuestionSchema', () => {
  it('should define required fields correctly', () => {
    const paths = SpeakingQuestionSchema.paths;
    expect(paths['topic']).toBeDefined();
    expect(paths['topic'].isRequired).toBeTruthy();
    expect(paths['question']).toBeDefined();
    expect(paths['question'].isRequired).toBeTruthy();
    expect(paths['level']).toBeDefined();
    expect(paths['status']).toBeDefined();
    expect(paths['prepScaffold']).toBeDefined();

    const prepPaths = SpeakingPrepScaffoldSchema.paths;
    expect(prepPaths['point']).toBeDefined();
    expect(prepPaths['reason']).toBeDefined();
    expect(prepPaths['example']).toBeDefined();
    expect(prepPaths['conclusion']).toBeDefined();
  });

  it('should have compound indexes defined', () => {
    const indexes = SpeakingQuestionSchema.indexes();
    const hasStorybookIndex = indexes.some(
      ([idx]: any) => idx.storybookId === 1 && idx.status === 1,
    );
    const hasLevelIndex = indexes.some(
      ([idx]: any) => idx.level === 1 && idx.status === 1,
    );
    expect(hasStorybookIndex).toBeTruthy();
    expect(hasLevelIndex).toBeTruthy();
  });
});
