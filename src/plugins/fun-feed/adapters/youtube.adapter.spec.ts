import axios from 'axios';
import { YoutubeAdapter } from './youtube.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YoutubeAdapter', () => {
  let adapter: YoutubeAdapter;

  beforeEach(() => {
    adapter = new YoutubeAdapter('dummy-yt-key');
    jest.clearAllMocks();
  });

  it('should fetch and normalize YouTube video items', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: { videoId: 'yt123' },
            snippet: {
              title: 'Learn English Idioms with Memes',
              channelTitle: 'Aha English',
              thumbnails: {
                high: { url: 'https://i.ytimg.com/vi/yt123/hqdefault.jpg' },
              },
            },
          },
        ],
      },
    });

    const results = await adapter.fetch('english idiom meme', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      source: 'youtube',
      sourceId: 'yt123',
      sourceUrl: 'https://www.youtube.com/watch?v=yt123',
      type: 'short_video',
      title: 'Learn English Idioms with Memes',
      mediaUrl: 'https://www.youtube.com/embed/yt123',
      thumbnailUrl: 'https://i.ytimg.com/vi/yt123/hqdefault.jpg',
      attribution: 'Aha English',
      rating: 'g',
    });
  });

  it('should return empty list when api key is missing or call fails', async () => {
    const emptyAdapter = new YoutubeAdapter('');
    const res = await emptyAdapter.fetch('test', 5);
    expect(res).toEqual([]);
  });
});
