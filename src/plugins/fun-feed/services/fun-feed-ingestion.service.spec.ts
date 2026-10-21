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
    youtubeAdapterMock = {
      fetch: jest.fn(),
      fetchWithReport: jest.fn(),
      fetchLatestFromChannelWithReport: jest.fn(),
    };
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

    // Existing item returns existing doc, new item returns null
    mediaModelMock.findOne
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce({ _id: 'old' }) })
      .mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: true,
        topic: 'grammar',
        level: 'beginner',
        whyFunny: 'Meme is funny because of pun',
        youLearned: 'Learned new word',
        learningScore: 0.8,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'funny', topic: 'grammar', source: 'giphy' },
      5,
    );

    expect(result.fetched).toBe(2);
    expect(result.deduped).toBe(1);
    expect(result.saved).toBe(1);
    expect(mediaModelMock.create).toHaveBeenCalledTimes(1);
    expect(mediaModelMock.create).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceId: 'new_id',
        whyFunny: 'Meme is funny because of pun',
        learningScore: 0.8,
      }),
    );
  });

  it('should skip items marked as unsafe or with low learningScore', async () => {
    giphyAdapterMock.fetchWithReport.mockResolvedValueOnce({
      items: [
        {
          source: 'giphy',
          sourceId: 'unsafe_id',
          sourceUrl: 'https://giphy.com/bad',
          type: 'gif',
          title: 'Offensive meme',
          mediaUrl: 'https://media.giphy.com/bad.gif',
        },
      ],
      report: { source: 'giphy', status: 'ok', count: 1 },
    });

    mediaModelMock.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValueOnce(null) });

    hiveServiceMock.invokeStructured.mockResolvedValueOnce({
      parsed: {
        isSafe: false,
        topic: 'grammar',
        level: 'beginner',
        whyFunny: 'Inappropriate content',
        youLearned: 'None',
        learningScore: 0.1,
      },
    });

    const result = await service.ingestSingleKeyword(
      { keyword: 'bad', topic: 'grammar', source: 'giphy' },
      5,
    );

    expect(result.saved).toBe(0);
    expect(mediaModelMock.create).not.toHaveBeenCalled();
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

  describe('ingestFromCuratedChannels', () => {
    it('should iterate active curated channels and save new enriched videos', async () => {
      youtubeAdapterMock.fetchLatestFromChannelWithReport.mockResolvedValue({
        items: [
          {
            source: 'youtube',
            sourceId: 'yt_curated_1',
            sourceUrl: 'https://youtube.com/watch?v=yt_curated_1',
            type: 'short_video',
            title: 'Grammar in 60 seconds',
            mediaUrl: 'https://youtube.com/embed/yt_curated_1',
            attribution: 'BBC Learning English',
          },
        ],
        report: { source: 'youtube', status: 'ok', count: 1 },
      });

      mediaModelMock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      hiveServiceMock.invokeStructured.mockResolvedValue({
        parsed: {
          isSafe: true,
          topic: 'grammar',
          level: 'beginner',
          whyFunny: 'Funny pronunciation trick',
          youLearned: 'Silent letters rule',
          learningScore: 0.95,
        },
      });

      const result = await service.ingestFromCuratedChannels({
        channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
        maxAgeHours: 48,
        limitPerChannel: 3,
      });

      expect(result.totalChannels).toBe(1);
      expect(result.fetched).toBe(1);
      expect(result.saved).toBe(1);
      expect(mediaModelMock.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'youtube',
          sourceId: 'yt_curated_1',
          whyFunny: 'Funny pronunciation trick',
          youLearned: 'Silent letters rule',
        }),
      );
    });

    it('should skip duplicate videos already in database', async () => {
      youtubeAdapterMock.fetchLatestFromChannelWithReport.mockResolvedValue({
        items: [
          {
            source: 'youtube',
            sourceId: 'already_existing_yt_id',
            sourceUrl: 'https://youtube.com/watch?v=already_existing_yt_id',
            type: 'short_video',
            title: 'Existing Short',
            mediaUrl: 'https://youtube.com/embed/already_existing_yt_id',
          },
        ],
        report: { source: 'youtube', status: 'ok', count: 1 },
      });

      mediaModelMock.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: 'db_id' }),
      });

      const result = await service.ingestFromCuratedChannels({
        channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
      });

      expect(result.fetched).toBe(1);
      expect(result.deduped).toBe(0);
      expect(result.saved).toBe(0);
      expect(hiveServiceMock.invokeStructured).not.toHaveBeenCalled();
    });
  });
});
