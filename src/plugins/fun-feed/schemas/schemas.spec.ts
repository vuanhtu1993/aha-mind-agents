import mongoose from 'mongoose';
import { AhaMediaContentSchema, AhaMediaContent } from './media-content.schema';
import { UserInteractionSchema, UserInteraction } from './user-interaction.schema';
import { FUNNY_KEYWORDS_POOL } from '../config/keywords.config';

describe('Fun Feed Schemas & Config', () => {
  it('should have predefined keywords in FUNNY_KEYWORDS_POOL', () => {
    expect(FUNNY_KEYWORDS_POOL.length).toBeGreaterThan(0);
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('keyword');
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('topic');
    expect(FUNNY_KEYWORDS_POOL[0]).toHaveProperty('source');
  });

  it('should validate AhaMediaContent schema correctly', () => {
    const MediaModel = mongoose.model<AhaMediaContent>('TestMedia', AhaMediaContentSchema);
    const validDoc = new MediaModel({
      source: 'giphy',
      sourceId: 'xyz123',
      sourceUrl: 'https://giphy.com/gifs/xyz123',
      type: 'gif',
      title: 'Grammar meme',
      mediaUrl: 'https://media.giphy.com/media/xyz123/giphy.gif',
      topic: 'grammar',
      level: 'beginner',
      whyFunny: 'Confusing past tense',
      youLearned: 'Irregular verbs',
      status: 'published',
    });

    const err = validDoc.validateSync();
    expect(err).toBeUndefined();
    expect(validDoc.status).toBe('published');
    expect(validDoc.stats.likes).toBe(0);
  });

  it('should validate UserInteraction schema correctly', () => {
    const InteractionModel = mongoose.model<UserInteraction>('TestInteraction', UserInteractionSchema);
    const validDoc = new InteractionModel({
      userId: 'user_001',
      contentId: new mongoose.Types.ObjectId().toString(),
      action: 'like',
    });

    const err = validDoc.validateSync();
    expect(err).toBeUndefined();
  });

  it('should accept reddit and threads as valid sources', () => {
    const sourcePath: any = AhaMediaContentSchema.path('source');
    expect(sourcePath.enumValues).toContain('reddit');
    expect(sourcePath.enumValues).toContain('threads');
  });

  it('should accept image and short_video as valid media types', () => {
    const typePath: any = AhaMediaContentSchema.path('type');
    expect(typePath.enumValues).toContain('image');
    expect(typePath.enumValues).toContain('short_video');
  });
});
