import { SpeakingQuizController } from './speaking-quiz.controller';
import { SpeakingQuizService } from './speaking-quiz.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

describe('SpeakingQuizController', () => {
  let controller: SpeakingQuizController;
  let mockService: Partial<SpeakingQuizService>;
  let mockPubSub: Partial<RedisPubSubService>;

  beforeEach(() => {
    mockService = {
      createJob: jest.fn().mockResolvedValue({
        jobId: 'job-sq-123',
        status: 'queued',
        sseUrl: '/api/agents/speaking-quiz/jobs/job-sq-123/progress',
        createdAt: '2026-09-30T16:40:00.000Z',
      }),
      getQuestionById: jest.fn().mockResolvedValue({ id: 'q123', topic: 'T1' } as any),
      getQuestionsByStorybook: jest.fn().mockResolvedValue({ total: 1, questions: [] }),
    };
    mockPubSub = {
      events$: jest.fn() as any,
    };

    controller = new SpeakingQuizController(
      mockService as SpeakingQuizService,
      mockPubSub as RedisPubSubService,
    );
  });

  it('should return 202 accepted response on job creation', async () => {
    const result = await controller.createJob({
      storybookId: 'sb123',
      level: 'B2',
    });
    expect(result.jobId).toBe('job-sq-123');
    expect(result.status).toBe('queued');
  });

  it('should get question by id', async () => {
    const result = await controller.getQuestionById('q123');
    expect(result.id).toBe('q123');
  });
});
