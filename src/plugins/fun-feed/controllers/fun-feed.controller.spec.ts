import { FunFeedController } from './fun-feed.controller';

describe('FunFeedController', () => {
  let controller: FunFeedController;
  let funFeedServiceMock: any;

  beforeEach(() => {
    funFeedServiceMock = {
      getFeed: jest.fn().mockResolvedValue({ items: [], nextCursor: null }),
      interact: jest.fn().mockResolvedValue({ success: true }),
    };

    controller = new FunFeedController(funFeedServiceMock);
  });

  it('should return feed items from service', async () => {
    const res = await controller.getFeed({ limit: 5 });
    expect(res).toHaveProperty('items');
    expect(funFeedServiceMock.getFeed).toHaveBeenCalled();
  });

  it('should process interact actions via service', async () => {
    const res = await controller.interact('media_1', { action: 'like' }, 'user_123');
    expect(res).toEqual({ success: true });
    expect(funFeedServiceMock.interact).toHaveBeenCalledWith('media_1', 'user_123', { action: 'like' });
  });
});
