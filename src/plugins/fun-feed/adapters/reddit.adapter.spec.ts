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

  it('should authenticate via OAuth2 when credentials are provided', async () => {
    const oauthAdapter = new RedditAdapter('client_id_123', 'client_secret_xyz');
    expect(oauthAdapter.isConfigured()).toBe(true);

    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'test_token_abc',
        token_type: 'bearer',
        expires_in: 3600,
      },
    });

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: {
          children: [
            {
              data: {
                id: 'oauth_post',
                title: 'Post via OAuth',
                permalink: '/r/grammar/comments/oauth_post/slug',
                url: 'https://i.redd.it/oauth.jpg',
                author: 'OAuthUser',
                post_hint: 'image',
                over_18: false,
                stickied: false,
              },
            },
          ],
        },
      },
    });

    const result = await oauthAdapter.fetchWithReport('english pun', 2);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://www.reddit.com/api/v1/access_token',
      'grant_type=client_credentials',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringContaining('Basic '),
        }),
      }),
    );
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('https://oauth.reddit.com/search'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test_token_abc',
        }),
      }),
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].sourceId).toBe('oauth_post');
  });

  it('should identify unconfigured adapter properly', () => {
    const unconfigured = new RedditAdapter();
    expect(unconfigured.isConfigured()).toBe(false);

    const withProxy = new RedditAdapter(undefined, undefined, 'http://proxy.example.com');
    expect(withProxy.isConfigured()).toBe(true);
  });

  it('should handle 403 WAF blocking gracefully without crashing', async () => {
    const error403: any = new Error('Request failed with status code 403');
    error403.response = { status: 403, data: { message: 'Blocked by Fastly' } };
    mockedAxios.get.mockRejectedValueOnce(error403);

    const result = await adapter.fetchWithReport('homophones funny english', 5);
    expect(result.report.status).toBe('error');
    expect(result.report.count).toBe(0);
    expect(result.items).toEqual([]);
  });

  it('should handle network errors gracefully and return error report', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Rate limited 429'));
    const result = await adapter.fetchWithReport('r/EnglishLearning', 5);
    expect(result.report.status).toBe('error');
    expect(result.report.count).toBe(0);
    expect(result.items).toEqual([]);
  });
});

