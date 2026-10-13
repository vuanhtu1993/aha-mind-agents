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

  it('should validate AdaptiveScaffoldOutputSchema with PAR framework and collocations', () => {
    const mockAdaptive = {
      frameworkType: 'PAR',
      frameworkName: 'PAR (Problem - Advice - Result)',
      frameworkDescription: 'Khung đưa ra lời khuyên và giải pháp thực tế cho vấn đề',
      topicCollocations: [
        { phrase: 'burn the candle at both ends', meaning: 'Làm việc kiệt sức cả ngày lẫn đêm' },
        { phrase: 'strike a work-life balance', meaning: 'Tạo lập sự cân bằng giữa công việc và cuộc sống' },
      ],
      stages: {
        stage1: {
          stageKey: 'problem',
          title: 'Problem Identification',
          signposts: ['The primary issue here is', 'When facing'],
          hint: 'Mô tả thực trạng kiệt sức của nhân viên',
          modelAnswer: 'The primary issue here is that employees often burn the candle at both ends without realizing the toll on their mental health.',
        },
        stage2: {
          stageKey: 'advice',
          title: 'Core Advice / Solution',
          signposts: ['My recommendation is to', 'It is advisable to'],
          hint: 'Đưa ra giải pháp quản trị linh hoạt',
          modelAnswer: 'My recommendation is to establish strict communication boundaries after working hours.',
        },
        stage3: {
          stageKey: 'alternative',
          title: 'Alternative / Complementary Action',
          signposts: ['Furthermore', 'Another viable approach is to'],
          hint: 'Bổ sung giải pháp văn hóa doanh nghiệp',
          modelAnswer: 'Furthermore, another viable approach is to encourage wellness days to help staff recharge.',
        },
        stage4: {
          stageKey: 'result',
          title: 'Expected Outcome & Benefit',
          signposts: ['Consequently', 'As a direct benefit'],
          hint: 'Khẳng định lợi ích lâu dài cho tổ chức',
          modelAnswer: 'Consequently, team members will effectively strike a work-life balance and sustain long-term engagement.',
        },
      },
    };

    // @ts-ignore
    const { AdaptiveScaffoldOutputSchema, toLegacyPrepScaffold } = require('./speaking-quiz.schema');
    const parsed = AdaptiveScaffoldOutputSchema.parse(mockAdaptive);
    expect(parsed.frameworkType).toBe('PAR');
    expect(parsed.topicCollocations.length).toBe(2);
    expect(parsed.stages.stage1.stageKey).toBe('problem');

    const legacy = toLegacyPrepScaffold(parsed);
    expect(legacy.point.title).toBe('Problem Identification');
    expect(legacy.reason.title).toBe('Core Advice / Solution');
    expect(legacy.example.title).toBe('Alternative / Complementary Action');
    expect(legacy.conclusion.title).toBe('Expected Outcome & Benefit');
    expect(legacy.point.modelAnswer).toContain('burn the candle');
  });
});

