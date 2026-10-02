import { StoryShadowingWorker } from './story-shadowing.worker';
import { TextPipelineService } from './pipelines/text.pipeline';
import { YoutubePipelineService } from './pipelines/youtube.pipeline';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';
import { Model } from 'mongoose';
import { Storybook } from '../../infra/database/schemas/storybook.schema';
import { of } from 'rxjs';

describe('StoryShadowingWorker', () => {
  let worker: StoryShadowingWorker;
  let mockTextPipeline: Partial<TextPipelineService>;
  let mockYoutubePipeline: Partial<YoutubePipelineService>;
  let mockRedisPubSub: Partial<RedisPubSubService>;
  let mockStorybookModel: any;

  beforeEach(() => {
    mockTextPipeline = {
      execute: jest.fn().mockReturnValue(
        of(
          { stepId: 'sentenceSplitter', status: 'completed', progress: 30, message: 'Split sentences' },
          {
            status: 'done',
            progress: 100,
            message: 'Completed',
            payload: {
              storyId: '679c1a2b3c4d5e6f7a8b9c0d',
              id: '679c1a2b3c4d5e6f7a8b9c0d',
              level: 'medium',
              sentences: [{ id: 1, text: 'Test' }],
              keywords: [],
            },
          },
        ),
      ),
    };

    mockYoutubePipeline = {
      execute: jest.fn().mockReturnValue(
        of(
          { stepId: 'youtubeFetcher', status: 'completed', progress: 30, message: 'Fetched subtitles' },
          {
            status: 'done',
            progress: 100,
            message: 'Completed',
            payload: {
              storyId: '679c1a2b3c4d5e6f7a8b9c0e',
              id: '679c1a2b3c4d5e6f7a8b9c0e',
              level: 'hard',
              sentences: [{ id: 1, text: 'YT Test' }],
              keywords: [],
            },
          },
        ),
      ),
    };

    mockRedisPubSub = {
      publishEvent: jest.fn().mockResolvedValue(true),
    };

    mockStorybookModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: { toString: () => '679c1a2b3c4d5e6f7a8b9c0d' },
      save: jest.fn().mockResolvedValue({ _id: '679c1a2b3c4d5e6f7a8b9c0d' }),
    }));

    worker = new StoryShadowingWorker(
      mockTextPipeline as TextPipelineService,
      mockYoutubePipeline as YoutubePipelineService,
      mockRedisPubSub as RedisPubSubService,
      mockStorybookModel as Model<Storybook>,
    );
  });

  it('should process text pipeline job, publish events, and return result', async () => {
    const mockJob: any = {
      id: 'job-text-123',
      data: {
        pipeline: 'text',
        text: 'Habits are the compound interest of self-improvement.',
        voice: 'FEMALE',
      },
      updateProgress: jest.fn().mockResolvedValue(true),
    };

    const result = await worker.process(mockJob);

    expect(mockTextPipeline.execute).toHaveBeenCalled();
    expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'JOB_STARTED', jobId: 'job-text-123' }),
    );
    expect(mockRedisPubSub.publishEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'JOB_COMPLETED', jobId: 'job-text-123' }),
    );
    expect(result.storyId).toBe('679c1a2b3c4d5e6f7a8b9c0d');
  });

  it('should process youtube pipeline job successfully', async () => {
    const mockJob: any = {
      id: 'job-yt-456',
      data: {
        pipeline: 'youtube',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      },
      updateProgress: jest.fn().mockResolvedValue(true),
    };

    const result = await worker.process(mockJob);

    expect(mockYoutubePipeline.execute).toHaveBeenCalled();
    expect(result.storyId).toBe('679c1a2b3c4d5e6f7a8b9c0e');
  });
});
