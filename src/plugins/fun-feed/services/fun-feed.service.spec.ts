import { FunFeedService } from './fun-feed.service';

describe('FunFeedService', () => {
  let service: FunFeedService;
  let mediaModelMock: any;
  let interactionModelMock: any;

  beforeEach(() => {
    mediaModelMock = {
      find: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
      findById: jest.fn(),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    interactionModelMock = {
      create: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn(),
    };

    service = new FunFeedService(mediaModelMock, interactionModelMock);
  });

  it('should query feed with published status and cursor pagination', async () => {
    const cursor = '2026-10-15T12:00:00.000Z';
    await service.getFeed({ cursor, limit: 10, topic: 'grammar' });

    expect(mediaModelMock.find).toHaveBeenCalledWith({
      status: 'published',
      topic: 'grammar',
      publishedAt: { $lt: new Date(cursor) },
    });
    expect(mediaModelMock.limit).toHaveBeenCalledWith(10);
  });

  it('should auto-hide content when report count reaches 3', async () => {
    interactionModelMock.countDocuments.mockResolvedValueOnce(3);

    await service.interact('media_1', 'user_1', { action: 'report', reportReason: 'Inappropriate' });

    expect(interactionModelMock.create).toHaveBeenCalled();
    expect(mediaModelMock.updateOne).toHaveBeenCalledWith(
      { _id: 'media_1' },
      { $set: { status: 'hidden' } },
    );
  });
});
