import axios from 'axios';
import { GiphyAdapter } from './giphy.adapter';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('GiphyAdapter', () => {
  let adapter: GiphyAdapter;

  beforeEach(() => {
    adapter = new GiphyAdapter('dummy-api-key');
    jest.clearAllMocks();
  });

  it('should fetch and normalize GIPHY items with rating g', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'g1',
            url: 'https://giphy.com/gifs/g1',
            title: 'Funny Grammar GIF',
            rating: 'g',
            username: 'grammarhero',
            images: {
              original: { url: 'https://media.giphy.com/media/g1/giphy.gif' },
              fixed_height_small: { url: 'https://media.giphy.com/media/g1/100.gif' },
            },
          },
        ],
      },
    });

    const results = await adapter.fetch('english grammar meme', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      source: 'giphy',
      sourceId: 'g1',
      sourceUrl: 'https://giphy.com/gifs/g1',
      type: 'gif',
      title: 'Funny Grammar GIF',
      mediaUrl: 'https://media.giphy.com/media/g1/giphy.gif',
      thumbnailUrl: 'https://media.giphy.com/media/g1/100.gif',
      attribution: 'grammarhero',
      rating: 'g',
    });
  });

  it('should return empty list when api key is missing or call fails', async () => {
    const emptyAdapter = new GiphyAdapter('');
    const res = await emptyAdapter.fetch('test', 5);
    expect(res).toEqual([]);
  });
});
