import { UnauthorizedException } from '@nestjs/common';
import { FunFeedCronController } from './fun-feed-cron.controller';

describe('FunFeedCronController', () => {
  let controller: FunFeedCronController;
  let ingestionServiceMock: any;
  let configServiceMock: any;

  beforeEach(() => {
    ingestionServiceMock = {
      ingestSingleKeyword: jest.fn().mockResolvedValue({ fetched: 5, deduped: 3, saved: 2 }),
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
    expect(res.processedKeywords).toBeGreaterThan(0);
    expect(ingestionServiceMock.ingestSingleKeyword).toHaveBeenCalled();
  });

  it('should allow execution if CRON_SECRET is not configured (dev mode)', async () => {
    configServiceMock.get.mockReturnValue(null);
    const res = await controller.handleVercelCron();
    expect(res.success).toBe(true);
  });
});
