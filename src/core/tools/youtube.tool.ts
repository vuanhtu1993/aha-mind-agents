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
      const transcript = await YoutubeTranscript.fetchTranscript(videoUrlOrId);
      this.logger.log(`✅ Tải thành công ${transcript.length} đoạn phụ đề.`);
      return transcript;
    } catch (error: any) {
      this.logger.error(`❌ Lỗi tải phụ đề YouTube: ${error.message}`);
      throw new Error(`Không thể lấy phụ đề từ YouTube. Vui lòng đảm bảo video này có phụ đề (Closed Captions). Lỗi: ${error.message}`);
    }
  }
}
