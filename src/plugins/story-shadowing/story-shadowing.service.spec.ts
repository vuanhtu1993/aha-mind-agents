import { StoryShadowingService } from './story-shadowing.service';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Storybook } from '../../infra/database/schemas/storybook.schema';

describe('StoryShadowingService', () => {
  let service: StoryShadowingService;
  let mockQueue: Partial<Queue>;
  let mockModel: any;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-ss-12345' }),
      getJob: jest.fn(),
    };
    mockModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    service = new StoryShadowingService(
      mockQueue as Queue,
      mockModel as Model<Storybook>,
    );
  });

  it('should enqueue job and return accepted response for text pipeline', async () => {
    const result = await service.createJob({
      pipeline: 'text',
      text: 'Habits are the compound interest of self-improvement.',
    });

    expect(result.jobId).toBe('job-ss-12345');
    expect(result.status).toBe('queued');
    expect(result.sseUrl).toContain('job-ss-12345');
    expect(mockQueue.add).toHaveBeenCalledWith(
      'process-shadowing',
      expect.objectContaining({ pipeline: 'text' }),
      expect.any(Object),
    );
  });

  it('should return existing storybook immediately if YouTube video already processed (Idempotency)', async () => {
    const mockExisting = {
      _id: '679c1a2b3c4d5e6f7a8b9c0d',
      title: 'Existing YouTube Lesson',
      createdAt: '2026-10-01T00:00:00.000Z',
    };
    (mockModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockExisting),
    });

    const result = await service.createJob({
      pipeline: 'youtube',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      forceRegenerate: false,
    });

    expect(result.status).toBe('completed');
    expect(result.existingStoryId).toBe('679c1a2b3c4d5e6f7a8b9c0d');
    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('should enqueue new job if forceRegenerate is true even if video exists', async () => {
    const result = await service.createJob({
      pipeline: 'youtube',
      youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      forceRegenerate: true,
    });

    expect(result.status).toBe('queued');
    expect(result.jobId).toBe('job-ss-12345');
    expect(mockQueue.add).toHaveBeenCalled();
  });

  it('should get story by id successfully', async () => {
    const mockStory = { _id: '679c1a2b3c4d5e6f7a8b9c0d', title: 'Test Story' };
    (mockModel.findById as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockStory),
    });

    const result = await service.getStoryById('679c1a2b3c4d5e6f7a8b9c0d');
    expect(result.title).toBe('Test Story');
  });

  it('should get stories list with filters', async () => {
    const mockStories = [{ _id: 's1', title: 'Story 1' }];
    (mockModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockStories),
        }),
      }),
    });

    const result = await service.getStories({ sourceType: 'youtube', level: 'easy' });
    expect(result.total).toBe(1);
    expect(result.stories).toHaveLength(1);
  });
});
