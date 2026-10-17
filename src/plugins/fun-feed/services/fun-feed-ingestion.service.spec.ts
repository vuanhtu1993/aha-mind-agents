import { FunFeedIngestionService } from './fun-feed-ingestion.service';
import { NormalizedMedia } from '../adapters/source-adapter.interface';

describe('FunFeedIngestionService', () => {
  let service: FunFeedIngestionService;
  let mediaModelMock: any;
  let hiveServiceMock: any;
  let giphyAdapterMock: any;
  let youtubeAdapterMock: any;
  let redditAdapterMock: any;
  let threadsAdapterMock: any;

  beforeEach(() => {
    mediaModelMock = {
      findOne: jest.fn().mockReturnValue({ lean: jest.fn() }),
      create: jest.fn(),
    };

    hiveServiceMock = {
      invokeStructured: jest.fn(),
    };

    giphyAdapterMock = { fetch: jest.fn(), fetchWithReport: jest.fn() };
    youtubeAdapterMock = { fetch: jest.fn(), fetchWithReport: jest.fn() };
    redditAdapterMock = { fetch: jest.fn(), fetchWithReport: jest.fn() };
    threadsAdapterMock = { fetch: jest.fn(), fetchWithReport: jest.fn() };

    service = new FunFeedIngestionService(
      mediaModelMock,
      hiveServiceMock,
      giphyAdapterMock,
      youtubeAdapterMock,
      redditAdapterMock,
      threadsAdapterMock,
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

    giphyAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: rawItems,
      report: { source: 'giphy', status: 'ok', count: 2 },
    });

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

  it('should fetch from Reddit when keyword source is reddit or all', async () => {
    redditAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: [
        {
          source: 'reddit',
          sourceId: 'red_1',
          sourceUrl: 'https://reddit.com/r/1',
          type: 'image',
          title: 'Reddit meme',
          mediaUrl: 'https://i.redd.it/1.jpg',
        },
      ],
      report: { source: 'reddit', status: 'ok', count: 1 },
    });

    mediaModelMock.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'grammar',
        level: 'intermediate',
        whyFunny: 'Oxford comma omitted',
        youLearned: 'Use comma before and',
        learningScore: 0.9,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'r/EnglishLearning', topic: 'grammar', source: 'reddit' },
      5,
    );

    expect(redditAdapterMock.fetchWithReport).toHaveBeenCalledWith('r/EnglishLearning', 5);
    expect(result.saved).toBe(1);
    expect(result.diagnostics?.reddit?.status).toBe('ok');
  });

  it('should fetch from Threads when keyword source is threads or all', async () => {
    threadsAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: [
        {
          source: 'threads',
          sourceId: 'th_1',
          sourceUrl: 'https://threads.net/1',
          type: 'image',
          title: 'Threads joke',
          mediaUrl: 'https://cdn.threads.net/1.jpg',
        },
      ],
      report: { source: 'threads', status: 'ok', count: 1 },
    });

    mediaModelMock.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'conversation',
        level: 'beginner',
        whyFunny: 'Puns on daily words',
        youLearned: 'Driveway vs parkway',
        learningScore: 0.85,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: '#englishjokes', topic: 'conversation', source: 'threads' },
      5,
    );

    expect(threadsAdapterMock.fetchWithReport).toHaveBeenCalledWith('#englishjokes', 5);
    expect(result.saved).toBe(1);
    expect(result.diagnostics?.threads?.status).toBe('ok');
  });
});
