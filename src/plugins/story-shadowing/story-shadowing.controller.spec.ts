import { StoryShadowingController } from './story-shadowing.controller';
import { StoryShadowingService } from './story-shadowing.service';
import { RedisPubSubService } from '../../core/services/redis-pubsub.service';

describe('StoryShadowingController', () => {
  let controller: StoryShadowingController;
  let mockService: Partial<StoryShadowingService>;
  let mockPubSub: Partial<RedisPubSubService>;

  beforeEach(() => {
    mockService = {
      createJob: jest.fn().mockResolvedValue({
        jobId: 'job-ss-123',
        status: 'queued',
        sseUrl: '/api/agents/story-shadowing/jobs/job-ss-123/progress',
        createdAt: '2026-10-02T10:00:00.000Z',
      }),
      getStoryById: jest.fn().mockResolvedValue({ _id: 's123', title: 'Story 1' } as any),
      getStories: jest.fn().mockResolvedValue({ total: 1, stories: [{ _id: 's123' }] }),
    };
    mockPubSub = {
      events$: jest.fn() as any,
    };

    controller = new StoryShadowingController(
      mockService as StoryShadowingService,
      mockPubSub as RedisPubSubService,
    );
  });

  it('should return 202 accepted response on job creation for text pipeline', async () => {
    const result = await controller.createJob({
      pipeline: 'text',
      text: 'Habits are the compound interest of self-improvement.',
    });
    expect(result.jobId).toBe('job-ss-123');
    expect(result.status).toBe('queued');
    expect(mockService.createJob).toHaveBeenCalledWith({
      pipeline: 'text',
      text: 'Habits are the compound interest of self-improvement.',
    });
  });

  it('should get story by id', async () => {
    const result = await controller.getStoryById('s123');
    expect(result._id).toBe('s123');
  });

  it('should get stories with optional filters', async () => {
    const result = await controller.getStories('youtube', 'medium');
    expect(result.total).toBe(1);
    expect(mockService.getStories).toHaveBeenCalledWith({
      sourceType: 'youtube',
      level: 'medium',
    });
  });
});
