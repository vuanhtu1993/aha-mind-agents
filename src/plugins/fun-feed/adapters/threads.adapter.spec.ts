import axios from 'axios';
import { ThreadsAdapter } from './threads.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ThreadsAdapter', () => {
  it('should return missing_key report when THREADS_ACCESS_TOKEN is not set', async () => {
    const adapter = new ThreadsAdapter('');
    const result = await adapter.fetchWithReport('#learnenglish', 5);
    expect(result.report.status).toBe('missing_key');
    expect(result.items).toEqual([]);
  });

  it('should fetch and normalize posts from Threads API when token is provided', async () => {
    const adapter = new ThreadsAdapter('valid-threads-token');
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'th_1',
            text: 'Why do we drive on a parkway and park on a driveway? English is hard.',
            media_type: 'IMAGE',
            media_url: 'https://scontent.cdninstagram.com/th_1.jpg',
            permalink: 'https://www.threads.net/@englishnerd/post/th_1',
            username: 'englishnerd',
          },
          {
            id: 'th_2',
            text: 'Short video explaining irregular verbs in 15 seconds',
            media_type: 'VIDEO',
            media_url: 'https://scontent.cdninstagram.com/th_2.mp4',
            permalink: 'https://www.threads.net/@teachertom/post/th_2',
            username: 'teachertom',
          },
        ],
      },
    });

    const result = await adapter.fetchWithReport('#englishhumor', 5);
    expect(result.report.status).toBe('ok');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toEqual({
      source: 'threads',
      sourceId: 'th_1',
      sourceUrl: 'https://www.threads.net/@englishnerd/post/th_1',
      type: 'image',
      title: 'Why do we drive on a parkway and park on a driveway? English is hard.',
      mediaUrl: 'https://scontent.cdninstagram.com/th_1.jpg',
      thumbnailUrl: 'https://scontent.cdninstagram.com/th_1.jpg',
      attribution: 'englishnerd',
      rating: 'g',
    });
    expect(result.items[1].type).toBe('short_video');
  });

  it('should handle API errors and return error report', async () => {
    const adapter = new ThreadsAdapter('valid-threads-token');
    mockedAxios.get.mockRejectedValueOnce(new Error('Graph API Error'));
    const result = await adapter.fetchWithReport('#englishjokes', 5);
    expect(result.report.status).toBe('error');
    expect(result.items).toEqual([]);
  });
});
