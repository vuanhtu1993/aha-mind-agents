import {
  CURATED_YOUTUBE_CHANNELS,
  getUploadsPlaylistId,
  normalizeHandle,
  YoutubeChannelConfig,
} from './channels.config';

describe('CURATED_YOUTUBE_CHANNELS', () => {
  it('should contain predefined active channels with user-friendly handles', () => {
    expect(CURATED_YOUTUBE_CHANNELS.length).toBeGreaterThan(0);
    const activeChannels = CURATED_YOUTUBE_CHANNELS.filter((c) => c.isActive);
    expect(activeChannels.length).toBeGreaterThanOrEqual(2);
  });

  it('should have valid handle and defaultTopic for each channel config', () => {
    CURATED_YOUTUBE_CHANNELS.forEach((channel: YoutubeChannelConfig) => {
      expect(channel.handle).toMatch(/^@[a-zA-Z0-9_.-]+$/);
      expect(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation']).toContain(
        channel.defaultTopic,
      );
    });
  });

  it('normalizeHandle should ensure @ prefix and trim whitespace', () => {
    expect(normalizeHandle('bbclearningenglish')).toBe('@bbclearningenglish');
    expect(normalizeHandle('  @EnglishwithLucy  ')).toBe('@EnglishwithLucy');
  });

  it('getUploadsPlaylistId should convert UC prefix to UU', () => {
    expect(getUploadsPlaylistId('UCHaHD477h-FeBbVh9Sh7syA')).toBe('UUHaHD477h-FeBbVh9Sh7syA');
    expect(getUploadsPlaylistId('UCKgpamMwp55x6wTG0dZcx0Q')).toBe('UUKgpamMwp55x6wTG0dZcx0Q');
    expect(getUploadsPlaylistId('custom-id')).toBe('custom-id');
  });
});
