import axios from 'axios';
import { RedditAdapter } from './reddit.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('RedditAdapter', () => {
  let adapter: RedditAdapter;

  beforeEach(() => {
    adapter = new RedditAdapter();
    jest.clearAllMocks();
  });

  it('should fetch and normalize image posts from a subreddit', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          children: [
            {
              data: {
                id: 'post_1',
                title: 'Funny Oxford Comma meme',
                permalink: '/r/EnglishLearning/comments/post_1/meme',
                url: 'https://i.redd.it/post_1.jpg',
                thumbnail: 'https://b.thumbs.redditmedia.com/thumb_1.jpg',
                author: 'GrammarCat',
                post_hint: 'image',
                over_18: false,
                stickied: false,
              },
            },
            {
              data: {
                id: 'post_nsfw',
                title: 'NSFW meme',
                permalink: '/r/EnglishLearning/comments/post_nsfw/bad',
                url: 'https://i.redd.it/bad.jpg',
                author: 'BadUser',
                post_hint: 'image',
                over_18: true, // Should be filtered out
                stickied: false,
              },
            },
            {
              data: {
                id: 'post_text_only',
                title: 'Question about grammar (no image)',
                permalink: '/r/EnglishLearning/comments/text/question',
                url: 'https://www.reddit.com/r/EnglishLearning/comments/text/question',
                author: 'Learner',
                post_hint: 'self', // Should be filtered out
                over_18: false,
                stickied: false,
              },
            },
          ],
        },
      },
    });

    const result = await adapter.fetchWithReport('r/EnglishLearning', 5);
    expect(result.report.status).toBe('ok');
    expect(result.report.count).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual({
      source: 'reddit',
      sourceId: 'post_1',
      sourceUrl: 'https://reddit.com/r/EnglishLearning/comments/post_1/meme',
      type: 'image',
      title: 'Funny Oxford Comma meme',
      mediaUrl: 'https://i.redd.it/post_1.jpg',
      thumbnailUrl: 'https://b.thumbs.redditmedia.com/thumb_1.jpg',
      attribution: 'u/GrammarCat',
      rating: 'g',
    });
  });

  it('should handle search queries when keyword is not a subreddit', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          children: [
            {
              data: {
                id: 'post_search',
                title: 'English homophones meme',
                permalink: '/r/memes/comments/post_search/homophones',
                url: 'https://i.redd.it/homophones.png',
                author: 'WordSmith',
                post_hint: 'image',
                over_18: false,
                stickied: false,
              },
            },
          ],
        },
      },
    });

    const items = await adapter.fetch('english homophones meme', 3);
    expect(items).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://www.reddit.com/search.json'),
      expect.any(Object),
    );
  });

  it('should handle network errors gracefully and return error report', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Rate limited 429'));
    const result = await adapter.fetchWithReport('r/EnglishLearning', 5);
    expect(result.report.status).toBe('error');
    expect(result.report.count).toBe(0);
    expect(result.items).toEqual([]);
  });
});
