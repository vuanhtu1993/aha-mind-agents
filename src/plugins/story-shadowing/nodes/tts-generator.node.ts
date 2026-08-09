import { Injectable, Logger } from '@nestjs/common';
import { TtsToolService } from '../../../core/tools/tts.tool';
import { StoryShadowingStateType } from '../story-shadowing.state';

@Injectable()
export class TtsGeneratorNode {
  private readonly logger = new Logger(TtsGeneratorNode.name);

  constructor(private readonly ttsTool: TtsToolService) {}

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.rawSentences?.length) return {};

    this.logger.log('Đang tổng hợp Audio TTS...');
    const speakingRate = 1.0;

    let ttsModel = 'en-US-Journey-F'; // Default Female
    if (state.voice === 'MALE') ttsModel = 'en-US-Journey-D';
    if (state.voice && state.voice.startsWith('en-')) {
      ttsModel = state.voice;
    }

    try {
      const texts = state.rawSentences.map(s => s.text);
      const audioList = await this.ttsTool.synthesizeBatch(texts, ttsModel, speakingRate);

      const sentences = state.rawSentences.map((s, idx) => ({
        id: s.id,
        text: s.text,
        audioBase64: audioList[idx],
        words: s.words,
      }));

      return { sentences, speakingRate };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi TTS Generator: ${err.message}`);
      return { error: 'Lỗi trong quá trình tổng hợp âm thanh bằng Google Cloud TTS.' };
    }
  }
}
