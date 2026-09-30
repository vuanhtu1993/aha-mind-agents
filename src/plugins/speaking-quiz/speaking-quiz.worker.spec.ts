import { SpeakingQuizWorker } from './speaking-quiz.worker';
import { SpeakingQuizPipelineService } from './pipelines/speaking-quiz.pipeline';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { of } from 'rxjs';

describe('SpeakingQuizWorker', () => {
  let worker: SpeakingQuizWorker;
  let mockPipeline: Partial<SpeakingQuizPipelineService>;
  let mockRedisPubSub: Partial<RedisPubSubService>;

  beforeEach(() => {
    mockPipeline = {
      execute: jest.fn().mockReturnValue(of({
        status: 'done',
        progress: 100,
        message: 'Completed',
        payload: { questionId: 'q123' },
      })),
    };
    mockRedisPubSub = {
      publishEvent: jest.fn().mockResolvedValue(undefined),
    };

    worker = new SpeakingQuizWorker(
      mockPipeline as SpeakingQuizPipelineService,
      mockRedisPubSub as RedisPubSubService,
    );
  });

  it('should process speaking quiz job successfully', async () => {
    const mockJob: any = {
      id: 'job-sq-123',
      data: {
        storybookId: 'sb123',
        level: 'B2',
      },
      updateProgress: jest.fn().mockResolvedValue(undefined),
    };

    const result = await worker.process(mockJob);
    expect(result.questionId).toBe('q123');
    expect(mockRedisPubSub.publishEvent).toHaveBeenCalled();
  });
});
