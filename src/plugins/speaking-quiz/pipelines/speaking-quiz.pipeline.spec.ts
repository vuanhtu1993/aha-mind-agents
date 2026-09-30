import { SpeakingQuizPipelineService } from './speaking-quiz.pipeline';
import { ContextResolverNode } from '../nodes/context-resolver.node';
import { QuestionFormulatorNode } from '../nodes/question-formulator.node';
import { PrepSynthesizerNode } from '../nodes/prep-synthesizer.node';
import { PersisterNode } from '../nodes/persister.node';
import { firstValueFrom, toArray } from 'rxjs';

describe('SpeakingQuizPipelineService', () => {
  let pipelineService: SpeakingQuizPipelineService;
  let mockContextResolver: Partial<ContextResolverNode>;
  let mockQuestionFormulator: Partial<QuestionFormulatorNode>;
  let mockPrepSynthesizer: Partial<PrepSynthesizerNode>;
  let mockPersister: Partial<PersisterNode>;

  beforeEach(() => {
    mockContextResolver = {
      invoke: jest.fn().mockResolvedValue({
        resolvedTopic: 'Topic A',
        sourceContentSummary: 'Summary A',
        targetKeywords: [],
        level: 'B2',
      }),
    };
    mockQuestionFormulator = {
      invoke: jest.fn().mockResolvedValue({
        generatedQuestion: 'Debate Question A?',
      }),
    };
    mockPrepSynthesizer = {
      invoke: jest.fn().mockResolvedValue({
        prepScaffold: {
          point: { title: 'Point', signposts: ['P'], hint: 'H', modelAnswer: 'A' },
          reason: { title: 'Reason', signposts: ['R'], hint: 'H', modelAnswer: 'A' },
          example: { title: 'Example', signposts: ['E'], hint: 'H', modelAnswer: 'A' },
          conclusion: { title: 'Conclusion', signposts: ['C'], hint: 'H', modelAnswer: 'A' },
        },
      }),
    };
    mockPersister = {
      invoke: jest.fn().mockResolvedValue({
        persistedId: '67a8b9c0f123456789abcdef',
      }),
    };

    pipelineService = new SpeakingQuizPipelineService(
      mockContextResolver as ContextResolverNode,
      mockQuestionFormulator as QuestionFormulatorNode,
      mockPrepSynthesizer as PrepSynthesizerNode,
      mockPersister as PersisterNode,
    );
  });

  it('should execute pipeline emitting progress events (25 -> 50 -> 80 -> 100)', async () => {
    const events$ = pipelineService.execute(
      { storybookId: '679c1a2b3c4d5e6f7a8b9c0d', level: 'B2' },
      { jobId: 'job-123', log: jest.fn() },
    );

    const events = (await firstValueFrom(events$.pipe(toArray()))) as any[];
    const progressList = events.map((e: any) => e.progress).filter(Boolean);

    expect(progressList).toContain(25);
    expect(progressList).toContain(50);
    expect(progressList).toContain(80);
    expect(progressList).toContain(100);
  });
});
