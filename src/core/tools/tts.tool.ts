import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TtsToolService {
  private readonly logger = new Logger(TtsToolService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Gọi API Google Cloud TTS với cơ chế tự động thử lại (Retry) khi gặp lỗi mạng hoặc Rate Limit (429).
   */
  public async synthesize(
    text: string,
    voiceModel: string = 'en-US-Journey-F',
    speakingRate: number = 1.0,
    retries = 3,
    delay = 1000,
  ): Promise<string> {
    const apiKey = this.configService.get<string>('GOOGLE_CLOUD_TTS_KEY');
    if (!apiKey) {
      throw new Error('Thiếu cấu hình GOOGLE_CLOUD_TTS_KEY');
    }

    const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', name: voiceModel },
          audioConfig: { audioEncoding: 'MP3', speakingRate },
        }),
      });

      if (!response.ok) {
        if (response.status === 429 && retries > 0) {
          this.logger.warn(`[TTS] 429 Rate Limit. Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          return this.synthesize(text, voiceModel, speakingRate, retries - 1, delay * 2);
        }
        const errorBody = await response.text();
        throw new Error(`Google Cloud TTS API error: ${response.status} - Chi tiết: ${errorBody}`);
      }

      const data = await response.json();
      return data.audioContent; // Base64 MP3
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(`[TTS] Network error. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.synthesize(text, voiceModel, speakingRate, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  /**
   * Xử lý tổng hợp âm thanh cho hàng loạt câu văn bản.
   * Tính toán khoảng thời gian trễ giữa các request dựa trên Rate Limit RPM.
   */
  public async synthesizeBatch(
    texts: string[],
    voiceModel: string = 'en-US-Journey-F',
    speakingRate: number = 1.0,
  ): Promise<string[]> {
    const rpmLimit = this.configService.get<number>('GOOGLE_TTS_RATE_LIMIT_RPM', 30);
    const delayBetweenRequests = Math.ceil((60 * 1000) / rpmLimit);
    const results: string[] = [];

    this.logger.log(`Bắt đầu tổng hợp âm thanh ${texts.length} câu (Model: ${voiceModel}, Giới hạn: ${rpmLimit} RPM)`);

    for (let i = 0; i < texts.length; i++) {
      const textToSynthesize = texts[i]?.trim();

      if (!textToSynthesize) {
        this.logger.debug(`[TTS] Câu ${i + 1}/${texts.length} rỗng, bỏ qua.`);
        results.push('');
        continue;
      }

      this.logger.debug(`[TTS] Đang xử lý câu ${i + 1}/${texts.length}...`);
      const audioBase64 = await this.synthesize(textToSynthesize, voiceModel, speakingRate);
      results.push(audioBase64);

      if (i < texts.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
      }
    }

    this.logger.log(`✅ Hoàn thành tổng hợp âm thanh ${texts.length} câu.`);
    return results;
  }
}
