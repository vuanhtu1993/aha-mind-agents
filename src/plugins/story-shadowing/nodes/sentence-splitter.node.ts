import { Injectable, Logger } from '@nestjs/common';
import { GeminiRotatorService } from '../../../core/services/gemini-rotator.service';
import { GeminiSentenceListSchema } from '../story-shadowing.schema';
import { StoryShadowingStateType } from '../story-shadowing.state';

const SYSTEM_PROMPT = `You are a language learning assistant and phonetics expert.
Split the given English text into individual sentences for shadowing practice.
You must also evaluate difficulty AND provide IPA transcription for every word.
Rules:
- Each sentence must be complete and independent
- Max 20 words per sentence. If a sentence is longer, split it at a natural pause (comma, conjunction).
- Keep the original wording exactly — do NOT paraphrase
- For each word in every sentence, provide the IPA pronunciation. Use standard broad transcription (e.g., /həˈləʊ/, /ˈbɪ.zɪnəs/).
- Include punctuation marks as part of the last word that precedes them (e.g., "Hello" not "Hello,").
- Difficulty levels:
  - "easy": Short sentences, common A1-A2 vocabulary.
  - "medium": Average sentences, B1-B2 vocabulary.
  - "hard": Complex sentences, academic C1-C2 vocabulary or complex structures.
- Return ONLY valid JSON in this exact format:
{"level": "easy", "sentences": [{"id": 0, "text": "Hello world.", "words": [{"word": "Hello", "ipa": "/həˈləʊ/"}, {"word": "world", "ipa": "/wɜːld/"}]}]}`;

@Injectable()
export class SentenceSplitterNode {
  private readonly logger = new Logger(SentenceSplitterNode.name);

  constructor(private readonly gemini: GeminiRotatorService) {}

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.rawText) return {};

    this.logger.log('Đang phân tách câu và trích xuất IPA...');
    
    try {
      const parsed = await this.gemini.invokeStructured(GeminiSentenceListSchema, [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: state.rawText },
      ]);
      
      this.logger.log(`✅ Phân tách thành công ${parsed.sentences.length} câu (Mức độ: ${parsed.level})`);
      
      return { 
        level: parsed.level,
        rawSentences: parsed.sentences
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi chia câu: ${err.message}`);
      return { error: 'Không thể chia câu. Vui lòng thử lại.' };
    }
  }
}
