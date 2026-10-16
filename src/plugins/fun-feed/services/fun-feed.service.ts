import { Injectable, Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AhaMediaContentDocument } from '../schemas/media-content.schema';
import { UserInteractionDocument } from '../schemas/user-interaction.schema';
import { FeedQueryDto } from '../dto/feed-query.dto';
import { InteractDto } from '../dto/interact.dto';

@Injectable()
export class FunFeedService {
  private readonly logger = new Logger(FunFeedService.name);

  constructor(
    private readonly mediaModel: Model<AhaMediaContentDocument>,
    private readonly interactionModel: Model<UserInteractionDocument>,
  ) {}

  async getFeed(query: FeedQueryDto) {
    const filter: any = { status: 'published' };

    if (query.topic) filter.topic = query.topic;
    if (query.level) filter.level = query.level;
    if (query.cursor) {
      filter.publishedAt = { $lt: new Date(query.cursor) };
    }

    const items = await this.mediaModel
      .find(filter)
      .sort({ publishedAt: -1 })
      .limit(query.limit)
      .lean();

    const nextCursor =
      items.length > 0 ? items[items.length - 1].publishedAt?.toISOString() : null;

    return {
      items,
      nextCursor,
      hasMore: items.length === query.limit,
    };
  }

  async interact(contentId: string, userId: string, dto: InteractDto) {
    await this.interactionModel.create({
      userId: userId || 'anonymous',
      contentId,
      action: dto.action,
      reportReason: dto.reportReason,
    });

    if (dto.action === 'like') {
      await this.mediaModel.updateOne({ _id: contentId }, { $inc: { 'stats.likes': 1 } });
    } else if (dto.action === 'report') {
      await this.mediaModel.updateOne({ _id: contentId }, { $inc: { 'stats.reports': 1 } });
      const reportCount = await this.interactionModel.countDocuments({
        contentId,
        action: 'report',
      });
      if (reportCount >= 3) {
        this.logger.warn(`Content [${contentId}] bị ẩn tự động do nhận >= 3 reports.`);
        await this.mediaModel.updateOne({ _id: contentId }, { $set: { status: 'hidden' } });
      }
    }

    return { success: true };
  }
}
