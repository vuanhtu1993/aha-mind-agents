import { Injectable, Logger } from '@nestjs/common';
import { YoutubeToolService } from '../../../core/tools/youtube.tool';
import { StoryShadowingStateType } from '../story-shadowing.state';

@Injectable()
export class YoutubeTranscriptFetcherNode {
  private readonly logger = new Logger(YoutubeTranscriptFetcherNode.name);

  constructor(private readonly youtubeTool: YoutubeToolService) {}

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.youtubeUrl) return {};

    this.logger.log(`Đang phân tích link YouTube: ${state.youtubeUrl}`);

    const videoId = this.youtubeTool.extractVideoId(state.youtubeUrl);
    if (!videoId) {
      return { error: 'Link YouTube không hợp lệ.' };
    }

    try {
      // Chạy song song lấy tiêu đề và phụ đề
      const [title, transcript] = await Promise.all([
        this.youtubeTool.fetchVideoTitle(videoId),
        this.youtubeTool.fetchTranscript(videoId),
      ]);

      if (!transcript || transcript.length === 0) {
        return { error: 'Video này không có phụ đề (CC). Vui lòng chọn video khác.' };
      }

      this.logger.log(`✅ Hoàn thành lấy phụ đề YouTube (${transcript.length} đoạn).`);

      return {
        youtubeTitle: title,
        youtubeTranscript: transcript.map(t => ({
          text: t.text,
          offset: t.offset,
          duration: t.duration,
        })),
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Youtube Fetcher: ${err.message}`);
      return { error: err.message || 'Không thể lấy phụ đề video. Video có thể bị giới hạn quốc gia hoặc không có phụ đề.' };
    }
  }
}
