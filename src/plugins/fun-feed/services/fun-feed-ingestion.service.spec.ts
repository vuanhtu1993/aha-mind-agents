import { FunFeedIngestionService } from './fun-feed-ingestion.service';
import { NormalizedMedia } from '../adapters/source-adapter.interface';

describe('FunFeedIngestionService', () => {
  let service: FunFeedIngestionService;
  let mediaModelMock: any;
  let hiveServiceMock: any;
  let giphyAdapterMock: any;
  let youtubeAdapterMock: any;

  beforeEach(() => {
    mediaModelMock = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn() }),
      create: jest.fn(),
    };

    hiveServiceMock = {
      invokeStructured: jest.fn(),
    };

    giphyAdapterMock = {
      fetch: jest.fn(),
    };

    youtubeAdapterMock = {
      fetch: jest.fn(),
    };

    service = new FunFeedIngestionService(
      mediaModelMock,
      hiveServiceMock,
      giphyAdapterMock,
      youtubeAdapterMock,
    );
  });

  it('should dedup existing items and enrich only new items', async () => {
    const rawItems: NormalizedMedia[] = [
      {
        source: 'giphy',
        sourceId: 'existing_id',
        sourceUrl: 'https://giphy.com/1',
        type: 'gif',
        title: 'Old meme',
        mediaUrl: 'https://media.giphy.com/1.gif',
      },
      {
        source: 'giphy',
        sourceId: 'new_id',
        sourceUrl: 'https://giphy.com/2',
        type: 'gif',
        title: 'New funny meme',
        mediaUrl: 'https://media.giphy.com/2.gif',
      },
    ];

    giphyAdapterMock.fetch.mockResolvedValueOnce(rawItems);
    youtubeAdapterMock.fetch.mockResolvedValueOnce([]);

    // existing_id exists, new_id does not
    mediaModelMock.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce({ _id: 'db_1' }) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'grammar',
        level: 'beginner',
        whyFunny: 'Because of incorrect irregular verbs',
        youLearned: 'Always check past participle',
        learningScore: 0.8,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'english grammar meme', topic: 'grammar', source: 'giphy' },
      5,
    );

    expect(result.fetched).toBe(2);
    expect(result.deduped).toBe(1);
    expect(result.saved).toBe(1);
    expect(mediaModelMock.create).toHaveBeenCalledTimes(1);
    expect(mediaModelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'new_id',
        status: 'published',
        learningScore: 0.8,
      }),
    );
  });
});
