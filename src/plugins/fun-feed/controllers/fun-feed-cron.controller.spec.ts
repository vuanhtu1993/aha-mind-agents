import { UnauthorizedException } from '@nestjs/common';
import { FunFeedCronController } from './fun-feed-cron.controller';

describe('FunFeedCronController', () => {
  let controller: FunFeedCronController;
  let ingestionServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    ingestionServiceMock = {
      ingestSingleKeyword: jest.fn().mockResolvedValue({ fetched: 5, deduped: 3, saved: 2 }),
      ingestFromCuratedChannels: jest.fn().mockResolvedValue({
        totalChannels: 5,
        fetched: 10,
        deduped: 8,
        saved: 2,
        channelReports: {},
      }),
    };

    configServiceMock = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'CRON_SECRET') return 'super-secret-cron-key';
        return null;
      }),
    };

    controller = new FunFeedCronController(ingestionServiceMock, configServiceMock);
  });

  it('should reject requests without valid Bearer token when CRON_SECRET is set', async () => {
    await expect(controller.handleVercelCron('Bearer invalid-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should execute batch ingest when Bearer token matches CRON_SECRET', async () => {
    const res = await controller.handleVercelCron('Bearer super-secret-cron-key');
    expect(res.success).toBe(true);
    expect(res.mode).toBe('keyword');
    expect(res.processedKeywords).toBeGreaterThan(0);
    expect(ingestionServiceMock.ingestSingleKeyword).toHaveBeenCalled();
  });

  it('should allow execution if CRON_SECRET is not configured (dev mode)', async () => {
    configServiceMock.get.mockReturnValue(null);
    const res = await controller.handleVercelCron();
    expect(res.success).toBe(true);
  });

  it('should accept custom source query param and pass to ingestionService', async () => {
    await controller.handleVercelCron(
      { headers: { authorization: 'Bearer super-secret-cron-key' } },
      'keyword',
      'r/grammar',
      '3',
      'reddit',
    );

    expect(ingestionServiceMock.ingestSingleKeyword).toHaveBeenCalledWith(
      expect.objectContaining({
        keyword: 'r/grammar',
        source: 'reddit',
      }),
      3,
    );
  });

  it('should route to ingestFromCuratedChannels when mode=channels in handleVercelCron', async () => {
    const res = await controller.handleVercelCron(
      { headers: { authorization: 'Bearer super-secret-cron-key' } },
      'channels',
      undefined,
      '5',
      undefined,
      '24',
    );

    expect(res.success).toBe(true);
    expect(res.mode).toBe('channels');
    expect(ingestionServiceMock.ingestFromCuratedChannels).toHaveBeenCalledWith({
      maxAgeHours: 24,
      limitPerChannel: 5,
    });
  });

  it('should support dedicated handleChannelsCron endpoint', async () => {
    const res = await controller.handleChannelsCron(
      { headers: { authorization: 'Bearer super-secret-cron-key' } },
      'UCHaHD477h-FeBbVh9Sh7syA',
      '72',
      '4',
    );

    expect(res.success).toBe(true);
    expect(res.mode).toBe('channels');
    expect(ingestionServiceMock.ingestFromCuratedChannels).toHaveBeenCalledWith({
      channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
      maxAgeHours: 72,
      limitPerChannel: 4,
    });
  });
});
