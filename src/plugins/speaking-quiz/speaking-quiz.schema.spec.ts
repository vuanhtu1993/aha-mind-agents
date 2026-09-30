import {
  StorybookSpeakingInputSchema,
  CustomTopicSpeakingInputSchema,
  QuestionFormulatorOutputSchema,
  PrepSynthesizerOutputSchema,
} from './speaking-quiz.schema';

describe('SpeakingQuizSchemas', () => {
  it('should validate storybook input successfully', () => {
    const input = { storybookId: '679c1a2b3c4d5e6f7a8b9c0d', level: 'B2' };
    const parsed = StorybookSpeakingInputSchema.parse(input);
    expect(parsed.storybookId).toBe('679c1a2b3c4d5e6f7a8b9c0d');
    expect(parsed.level).toBe('B2');
  });

  it('should validate custom topic input successfully', () => {
    const input = { customTopic: 'AI and Future Jobs', level: 'C1' };
    const parsed = CustomTopicSpeakingInputSchema.parse(input);
    expect(parsed.customTopic).toBe('AI and Future Jobs');
    expect(parsed.level).toBe('C1');
  });

  it('should validate question formulator output schema', () => {
    const mockOutput = {
      topic: 'Technology in Education',
      question: 'Should traditional textbooks be completely replaced by AI?',
    };
    const parsed = QuestionFormulatorOutputSchema.parse(mockOutput);
    expect(parsed.topic).toBe('Technology in Education');
    expect(parsed.question).toContain('traditional textbooks');
  });

  it('should validate PREP synthesizer output schema with all 4 stages', () => {
    const mockPrep = {
      point: {
        title: 'Point',
        signposts: ['In my view', 'I strongly believe'],
        hint: 'State your core viewpoint clearly',
        modelAnswer: 'In my view, AI should assist teachers rather than replace them.',
      },
      reason: {
        title: 'Reason',
        signposts: ['The main reason is', 'Because'],
        hint: 'Explain why you hold this perspective',
        modelAnswer: 'The main reason is that human empathy cannot be replicated.',
      },
      example: {
        title: 'Example',
        signposts: ['For instance', 'Take an example of'],
        hint: 'Provide a concrete demonstration',
        modelAnswer: 'For instance, when a student experiences emotional distress, a mentor helps.',
      },
      conclusion: {
        title: 'Conclusion',
        signposts: ['In conclusion', 'To sum up'],
        hint: 'Restate and reinforce your point',
        modelAnswer: 'To sum up, harmonious collaboration between humans and AI is essential.',
      },
    };
    const parsed = PrepSynthesizerOutputSchema.parse(mockPrep);
    expect(parsed.point.signposts.length).toBeGreaterThanOrEqual(2);
    expect(parsed.conclusion.title).toBe('Conclusion');
  });
});
