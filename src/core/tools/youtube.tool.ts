import { Injectable, Logger } from '@nestjs/common';
import { YoutubeTranscript, TranscriptResponse } from 'youtube-transcript';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class YoutubeToolService {
  private readonly logger = new Logger(YoutubeToolService.name);

  constructor(private readonly configService: ConfigService) { }

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
   * Chiến lược ưu tiên:
   *   1. Gọi Supadata API (qua IP sạch, không bị Vercel block)
   *   2. Fallback về youtube-transcript (dùng khi Local Dev)
   * @param videoUrlOrId URL hoặc ID của video
   * @returns Danh sách các đoạn phụ đề kèm theo offset và duration
   */
  public async fetchTranscript(videoUrlOrId: string): Promise<TranscriptResponse[]> {
    this.logger.log(`Đang tải phụ đề từ YouTube: ${videoUrlOrId}`);

    // --- Ưu tiên 1: Supadata API (Giải pháp cho Vercel) ---
    const supadataApiKey = this.configService.get<string>('SUPADATA_API_KEY') || process.env.SUPADATA_API_KEY;
    if (supadataApiKey) {
      try {
        const transcript = await this.fetchTranscriptFromSupadata(videoUrlOrId, supadataApiKey);
        this.logger.log(`✅ [Supadata] Tải thành công ${transcript.length} đoạn phụ đề.`);
        return transcript;
      } catch (err: any) {
        // Nếu lỗi liên quan đến nội dung video (không có CC), ném lỗi ngay
        if (err.message === 'BAD_TRANSCRIPT' || err.message === 'NO_TRANSCRIPT') {
          this.logger.error(`❌ [Supadata] ${err.message}`);
          throw err;
        }
        // Nếu lỗi về network/API → fallback về thư viện cũ
        this.logger.warn(`⚠️ [Supadata] Thất bại: ${err.message}. Fallback về youtube-transcript...`);
      }
    }

    // --- Ưu tiên 2: Fallback về youtube-transcript (cho Local Dev) ---
    return this.fetchTranscriptLocal(videoUrlOrId);
  }

  /**
   * Lấy phụ đề qua Supadata API - không bị chặn bởi Vercel/Datacenter IP.
   * Supadata cung cấp IP sạch và chứng thực (authentication) riêng.
   */
  private async fetchTranscriptFromSupadata(videoUrlOrId: string, apiKey: string): Promise<TranscriptResponse[]> {
    // Supadata chấp nhận cả URL lẫn videoId
    const params = new URLSearchParams({ videoId: videoUrlOrId, lang: 'en' });
    const res = await fetch(`https://api.supadata.ai/v1/youtube/transcript?${params}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (res.status === 404) {
      throw new Error('NO_TRANSCRIPT');
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Supadata API lỗi ${res.status}: ${errorText}`);
    }

    const data: { content?: Array<{ text: string; offset: number; duration: number; lang: string }> } = await res.json();

    if (!data.content || data.content.length === 0) {
      throw new Error('NO_TRANSCRIPT');
    }

    // Chỉ lấy phụ đề tiếng Anh thủ công (Supadata có thể trả về nhiều ngôn ngữ)
    const enContent = data.content.filter(s => s.lang?.startsWith('en'));
    if (enContent.length === 0) {
      throw new Error('BAD_TRANSCRIPT');
    }

    // Chuyển đổi về đúng format TranscriptResponse của thư viện youtube-transcript
    return enContent.map(s => ({
      text: s.text,
      offset: Math.round(s.offset),
      duration: Math.round(s.duration),
      lang: s.lang,
    }));
  }

  /**
   * Fallback: Lấy phụ đề bằng thư viện youtube-transcript (hoạt động tốt ở Local).
   * Áp dụng Monkey Patch để ưu tiên phụ đề thủ công (Manual CC) tiếng Anh.
   */
  private async fetchTranscriptLocal(videoUrlOrId: string): Promise<TranscriptResponse[]> {
    // --- Monkey Patch để ưu tiên phụ đề thủ công (Manual English) ---
    if (!(YoutubeTranscript as any).__patchedForManualSubtitles) {
      const originalFetchTranscriptFromTracks = (YoutubeTranscript as any).fetchTranscriptFromTracks;
      (YoutubeTranscript as any).fetchTranscriptFromTracks = async function (captionTracks: any[], vId: string, config: any) {
        let tracks = captionTracks;
        if (config?.lang) {
          tracks = captionTracks.filter((t: any) => t.languageCode === config.lang);
        }
        if (tracks.length > 0) {
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

    try {
      const transcript = await YoutubeTranscript.fetchTranscript(videoUrlOrId);
      this.logger.log(`✅ [Local] Tải thành công ${transcript.length} đoạn phụ đề.`);
      return transcript;
    } catch (error: any) {
      this.logger.error(`❌ [Local] Lỗi: ${error.message}`);
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
