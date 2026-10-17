import { FUNNY_KEYWORDS_POOL, KeywordItem } from './keywords.config';

describe('FUNNY_KEYWORDS_POOL', () => {
  it('should include keywords for reddit and threads', () => {
    const redditKeywords = FUNNY_KEYWORDS_POOL.filter((k) => k.source === 'reddit');
    const threadsKeywords = FUNNY_KEYWORDS_POOL.filter((k) => k.source === 'threads');

    expect(redditKeywords.length).toBeGreaterThanOrEqual(3);
    expect(threadsKeywords.length).toBeGreaterThanOrEqual(3);
  });

  it('should ensure every keyword item has valid properties', () => {
    FUNNY_KEYWORDS_POOL.forEach((item: KeywordItem) => {
      expect(item.keyword).toBeDefined();
      expect(item.keyword.length).toBeGreaterThan(0);
      expect(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation']).toContain(item.topic);
      expect(['giphy', 'youtube', 'threads', 'reddit', 'all']).toContain(item.source);
    });
  });
});
