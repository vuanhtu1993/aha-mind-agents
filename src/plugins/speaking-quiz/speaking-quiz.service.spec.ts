import { SpeakingQuizService } from './speaking-quiz.service';
import { Queue } from 'bullmq';
import { Model } from 'mongoose';
import { SpeakingQuestion } from '../../infra/database/schemas/speaking-question.schema';

describe('SpeakingQuizService', () => {
  let service: SpeakingQuizService;
  let mockQueue: Partial<Queue>;
  let mockModel: any;

  beforeEach(() => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-sq-12345' }),
      getJob: jest.fn(),
    };
    mockModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      find: jest.fn(),
    };
    service = new SpeakingQuizService(
      mockQueue as Queue,
      mockModel as Model<SpeakingQuestion>,
    );
  });

  it('should enqueue job and return accepted response', async () => {
    (mockModel.findOne as jest.Mock).mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });

    const result = await service.createJob({
      storybookId: 'sb123',
      level: 'B2',
    });

    expect(result.jobId).toBe('job-sq-12345');
    expect(result.status).toBe('queued');
    expect(result.sseUrl).toContain('job-sq-12345');
  });

  it('should find questions by storybookId', async () => {
    const mockQuestions = [{ _id: 'q1', topic: 'Topic 1' }];
    (mockModel.find as jest.Mock).mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(mockQuestions),
      }),
    });

    const result = await service.getQuestionsByStorybook('679c1a2b3c4d5e6f7a8b9c0d');
    expect(result.total).toBe(1);
    expect(result.questions).toHaveLength(1);
  });
});
