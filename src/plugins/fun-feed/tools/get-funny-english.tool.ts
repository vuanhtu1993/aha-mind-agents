import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Model } from 'mongoose';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';

const FunnyEnglishToolSchema = z.object({
  topic: z
    .enum(['grammar', 'vocabulary', 'pronunciation', 'idiom', 'conversation'])
    .optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  limit: z.number().max(5).default(3),
});

export const createGetFunnyEnglishTool = (mediaModel: Model<AhaMediaContentDocument>) => {
  return new (DynamicStructuredTool as any)({
    name: 'get_funny_english',
    description:
      'Tìm kiếm meme, video hoặc ảnh hài hước về tiếng Anh để giải trí và học tập nhẹ nhàng cho người học.',
    schema: FunnyEnglishToolSchema,
    func: async ({ topic, level, limit }: z.infer<typeof FunnyEnglishToolSchema>) => {
      const filter: any = { status: 'published' };
      if (topic) filter.topic = topic;
      if (level) filter.level = level;

      const items = await mediaModel
        .find(filter)
        .limit(limit || 3)
        .lean();

      return JSON.stringify(
        items.map((i) => ({
          title: i.title,
          type: i.type,
          mediaUrl: i.mediaUrl,
          whyFunny: i.whyFunny,
          youLearned: i.youLearned,
          sourceUrl: i.sourceUrl,
        })),
      );
    },
  });
};
