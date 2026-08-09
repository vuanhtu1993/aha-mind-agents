import { Injectable, Logger } from '@nestjs/common';
import { YoutubeTranscript, TranscriptResponse } from 'youtube-transcript';

@Injectable()
export class YoutubeToolService {
  private readonly logger = new Logger(YoutubeToolService.name);

  /**
   * Trích xuất ID video từ đường dẫn URL của YouTube.
   * Hỗ trợ các định dạng: youtube.com/watch?v=ID, youtu.be/ID, v.v.
   */
  public extractVideoId(url: string): string | null {
    const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    return null;
  }

  /**
   * Tải phụ đề (Transcript) của một Video từ YouTube.
   * @param videoUrlOrId URL hoặc ID của video
   * @returns Danh sách các đoạn phụ đề kèm theo offset và duration
   */
  public async fetchTranscript(videoUrlOrId: string): Promise<TranscriptResponse[]> {
    this.logger.log(`Đang tải phụ đề từ YouTube: ${videoUrlOrId}`);
    try {
      // --- Monkey Patch YoutubeTranscript để luôn ưu tiên phụ đề thủ công (Manual English) ---
      if (!(YoutubeTranscript as any).__patchedForManualSubtitles) {
        const originalFetchTranscriptFromTracks = (YoutubeTranscript as any).fetchTranscriptFromTracks;
        (YoutubeTranscript as any).fetchTranscriptFromTracks = async function (captionTracks: any[], vId: string, config: any) {
          let tracks = captionTracks;
          if (config?.lang) {
            tracks = captionTracks.filter((t: any) => t.languageCode === config.lang);
          }

          if (tracks.length > 0) {
            // Chỉ lấy track tiếng Anh (en) và thủ công (không phải asr)
            const bestTrack = tracks.find((t: any) => t.languageCode.startsWith('en') && t.kind !== 'asr');
            
            if (!bestTrack) {
              throw new Error('BAD_TRANSCRIPT');
            }
            return originalFetchTranscriptFromTracks.call(this, [bestTrack], vId, config);
          }
          return originalFetchTranscriptFromTracks.call(this, captionTracks, vId, config);
        };
        (YoutubeTranscript as any).__patchedForManualSubtitles = true;
      }

      const transcript = await YoutubeTranscript.fetchTranscript(videoUrlOrId);
      this.logger.log(`✅ Tải thành công ${transcript.length} đoạn phụ đề.`);
      return transcript;
    } catch (error: any) {
      this.logger.error(`❌ Lỗi tải phụ đề YouTube: ${error.message}`);
      if (error.message === 'BAD_TRANSCRIPT') {
        throw new Error('Video này không có phụ đề tiếng Anh thủ công (Manual CC). Phụ đề tự động (Auto-generated) thường sai lệch thời gian rất lớn. Vui lòng chọn video khác!');
      }
      throw new Error(`Không thể lấy phụ đề từ YouTube. Vui lòng đảm bảo video này có phụ đề (Closed Captions). Lỗi: ${error.message}`);
    }
  }

  /**
   * Lấy tiêu đề video thông qua oEmbed API của YouTube (Public, không cần API Key)
   */
  public async fetchVideoTitle(videoId: string): Promise<string> {
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        if (oembedData.title) return oembedData.title;
      }
    } catch (e) {
      // Ignore
    }
    return 'YouTube Video';
  }
}
