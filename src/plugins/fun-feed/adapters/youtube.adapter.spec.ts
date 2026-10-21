import axios from 'axios';
import { YoutubeAdapter } from './youtube.adapter';
import { YoutubeChannelConfig } from '../config/channels.config';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YoutubeAdapter', () => {
  let adapter: YoutubeAdapter;
  const mockChannel: YoutubeChannelConfig = {
    handle: '@bbclearningenglish',
    channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
    name: 'BBC Learning English',
    uploadsPlaylistId: 'UUHaHD477h-FeBbVh9Sh7syA',
    defaultTopic: 'grammar',
    isActive: true,
  };

  beforeEach(() => {
    adapter = new YoutubeAdapter('dummy-yt-key');
    jest.clearAllMocks();
  });

  describe('resolveChannel (Handle Resolution)', () => {
    it('should use pre-configured channelId if already present', async () => {
      const resolved = await adapter.resolveChannel(mockChannel);
      expect(resolved).toEqual({
        channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
        name: 'BBC Learning English',
        uploadsPlaylistId: 'UUHaHD477h-FeBbVh9Sh7syA',
      });
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    it('should resolve handle via YouTube Data API v3 when apiKey is present', async () => {
      const handleOnlyChannel: YoutubeChannelConfig = {
        handle: '@LearnEnglishWithTVSeries',
        defaultTopic: 'conversation',
        isActive: true,
      };

      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [
            {
              id: 'UCKgpamMwp55x6wTG0dZcx0Q',
              snippet: { title: 'Learn English With TV Series' },
              contentDetails: {
                relatedPlaylists: { uploads: 'UUKgpamMwp55x6wTG0dZcx0Q' },
              },
            },
          ],
        },
      });

      const resolved = await adapter.resolveChannel(handleOnlyChannel);
      expect(resolved).toEqual({
        channelId: 'UCKgpamMwp55x6wTG0dZcx0Q',
        name: 'Learn English With TV Series',
        uploadsPlaylistId: 'UUKgpamMwp55x6wTG0dZcx0Q',
      });
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/channels',
        expect.objectContaining({
          params: expect.objectContaining({
            forHandle: 'LearnEnglishWithTVSeries',
          }),
        }),
      );
    });

    it('should fallback to HTML scraping when no apiKey or API fails', async () => {
      const emptyKeyAdapter = new YoutubeAdapter('');
      const handleOnlyChannel: YoutubeChannelConfig = {
        handle: '@EnglishwithLucy',
        defaultTopic: 'pronunciation',
        isActive: true,
      };

      const mockHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta itemprop="channelId" content="UCz4tgANd4yy8Oe0iXCdSWnw">
            <meta property="og:title" content="English with Lucy - YouTube">
          </head>
        </html>
      `;

      mockedAxios.get.mockResolvedValueOnce({
        data: mockHtml,
      });

      const resolved = await emptyKeyAdapter.resolveChannel(handleOnlyChannel);
      expect(resolved).toEqual({
        channelId: 'UCz4tgANd4yy8Oe0iXCdSWnw',
        name: 'English with Lucy',
        uploadsPlaylistId: 'UUz4tgANd4yy8Oe0iXCdSWnw',
      });
    });
  });

  describe('fetch (Legacy Keyword Search)', () => {
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

  describe('fetchLatestFromChannel (Channel Curation Ingestion)', () => {
    it('should fetch from YouTube playlistItems API using uploadsPlaylistId', async () => {
      const now = new Date();
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          items: [
            {
              contentDetails: { videoId: 'bbc_short_1' },
              snippet: {
                title: 'BBC 6 Minute Grammar Short',
                channelTitle: 'BBC Learning English',
                publishedAt: now.toISOString(),
                thumbnails: {
                  high: { url: 'https://i.ytimg.com/vi/bbc_short_1/hqdefault.jpg' },
                },
              },
            },
          ],
        },
      });

      const items = await adapter.fetchLatestFromChannel(mockChannel, { maxAgeHours: 48, limit: 3 });
      expect(items).toHaveLength(1);
      expect(items[0].sourceId).toBe('bbc_short_1');
      expect(items[0].attribution).toBe('BBC Learning English');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/youtube/v3/playlistItems',
        expect.objectContaining({
          params: expect.objectContaining({
            playlistId: 'UUHaHD477h-FeBbVh9Sh7syA',
          }),
        }),
      );
    });

    it('should fallback to RSS feed when api key is empty', async () => {
      const emptyKeyAdapter = new YoutubeAdapter('');
      const fakeRssXml = `
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
          <entry>
            <yt:videoId>rss_vid_1</yt:videoId>
            <title>Grammar Hack #shorts</title>
            <published>${new Date().toISOString()}</published>
            <media:group>
              <media:thumbnail url="https://i.ytimg.com/vi/rss_vid_1/hqdefault.jpg"/>
            </media:group>
          </entry>
        </feed>
      `;

      mockedAxios.get.mockResolvedValueOnce({
        data: fakeRssXml,
      });

      const items = await emptyKeyAdapter.fetchLatestFromChannel(mockChannel, { maxAgeHours: 48 });
      expect(items).toHaveLength(1);
      expect(items[0].sourceId).toBe('rss_vid_1');
      expect(items[0].title).toBe('Grammar Hack #shorts');
      expect(items[0].metadata?.isRssFallback).toBe(true);
    });

    it('should fallback to RSS feed when playlistItems API call throws error', async () => {
      // Lần 1: playlistItems API bị lỗi quota (403)
      mockedAxios.get.mockRejectedValueOnce(new Error('Quota exceeded'));

      // Lần 2: Fallback sang RSS thành công
      const fakeRssXml = `
        <feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">
          <entry>
            <yt:videoId>rss_fallback_vid</yt:videoId>
            <title>Funny Pronunciation Fail</title>
            <published>${new Date().toISOString()}</published>
          </entry>
        </feed>
      `;
      mockedAxios.get.mockResolvedValueOnce({
        data: fakeRssXml,
      });

      const items = await adapter.fetchLatestFromChannel(mockChannel, { maxAgeHours: 24 });
      expect(items).toHaveLength(1);
      expect(items[0].sourceId).toBe('rss_fallback_vid');
    });
  });
});
