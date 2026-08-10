import { Injectable, Logger } from '@nestjs/common';
import { GeminiRotatorService } from '../../../core/services/gemini-rotator.service';
import { IdentifiedKeywordListSchema } from '../story-shadowing.schema';
import { StoryShadowingStateType } from '../story-shadowing.state';

const SYSTEM_PROMPT = `You are a professional lexicographer and curriculum designer for English learners.
Your task is to identify challenging vocabulary from the provided text for a B1-B2 learner to study.
Do NOT provide explanations or IPA — just identify the items and their context.

Rules:
1. Extract between 5 to 15 items depending on the text length and difficulty.
2. Items can be single words, idioms, or phrasal verbs.
3. Categorize them into "word", "idiom", or "phrasal_verb".
4. Provide the EXACT sentence (context) where the item appears in the text.
5. Level: Assign a CEFR level to the item ("A1", "A2", "B1", "B2", "C1", or "C2"). B2/C1/C2 are preferred for challenging words.
6. Ignore common A1-A2 words (like 'hello', 'because', 'beautiful') and proper nouns (names of people, places).

Output valid JSON matching the schema.`;

@Injectable()
export class KeywordIdentifierNode {
  private readonly logger = new Logger(KeywordIdentifierNode.name);

  constructor(private readonly gemini: GeminiRotatorService) {}

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    // Đối với Text Pipeline: state.rawText có sẵn.
    // Đối với YouTube Pipeline: state.rawText có thể rỗng, ta nối từ youtubeTranscript.
    let textToAnalyze = state.rawText || '';
    if (!textToAnalyze && state.youtubeTranscript) {
      textToAnalyze = state.youtubeTranscript.map(t => t.text).join(' ');
    }

    if (!textToAnalyze) {
      this.logger.warn('Không có văn bản nào để trích xuất keyword.');
      return { identifiedKeywords: [] };
    }

    this.logger.log('Đang nhận diện từ vựng khó (Keywords)...');

    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: textToAnalyze },
      ] as any;

      const response = await this.gemini.invokeStructured(
        IdentifiedKeywordListSchema,
        messages,
        { temperature: 0.1, name: 'extract_difficult_keywords' }
      );
      
      this.logger.log(`✅ Trích xuất thành công ${response.parsed.items.length} từ vựng khó.`);

      return {
        identifiedKeywords: response.parsed.items,
        tokenUsage: response.usage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Keyword Identifier: ${err.message}`);
      return { identifiedKeywords: [] };
    }
  }
}
