import { Injectable, Logger } from '@nestjs/common';
import { GeminiRotatorService } from '../../../core/services/gemini-rotator.service';
import { GeminiBatchKeywordEnrichSchema, IdentifiedKeywordItem } from '../story-shadowing.schema';
import { StoryShadowingStateType } from '../story-shadowing.state';

@Injectable()
export class KeywordEnricherNode {
  private readonly logger = new Logger(KeywordEnricherNode.name);

  constructor(private readonly gemini: GeminiRotatorService) {}

  private getBatchEnrichmentPrompt(items: IdentifiedKeywordItem[]) {
    const itemsListStr = items.map((item, i) => `
[Item ${i + 1}]
- Word/Phrase: "${item.word}"
- Type: ${item.type}
- Context: "${item.context}"`).join('\n');

    return `You are an English teacher explaining vocabulary to a B1-B2 learner.
The student encountered the following items in a reading text:
${itemsListStr}

For EACH item, provide:
1. "word": the exact Word/Phrase from the input to match them.
2. "explanation": A clear, simple explanation (in Vietnamese if helpful, or simple English) of what this item means EXACTLY IN THIS CONTEXT. Include a short example of usage if it's an idiom/phrasal verb.
3. "wordFamily": 1-3 related words (e.g. noun form, adjective form).
4. "collocations": 1-3 common collocations for this item.

Keep explanations concise and pedagogical. Output an array of items matching the schema.`;
  }

  private async fetchDictionaryIpa(word: string): Promise<{ ipa: string, audioUrl: string } | null> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
      
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) return null;
      
      const data = await response.json();
      if (!Array.isArray(data) || data.length === 0) return null;

      const entry = data[0];
      const phonetics = entry.phonetics || [];
      
      const ipa = phonetics.find((p: any) => p.text)?.text || entry.phonetic || '';
      const audioUrl = phonetics.find((p: any) => p.audio && p.audio.length > 0)?.audio || '';

      return { ipa, audioUrl };
    } catch (e) {
      return null;
    }
  }

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (!state.identifiedKeywords || state.identifiedKeywords.length === 0) {
      return { keywords: [] };
    }

    this.logger.log(`Đang phân tích sâu và giải nghĩa ${state.identifiedKeywords.length} từ vựng...`);

    try {
      // Tách riêng các từ đơn (word) để gọi Dictionary API
      const wordItems = state.identifiedKeywords.filter(item => item.type === 'word');
      
      // Chạy song song Gemini và Dictionary API
      const [parsed, dictResults] = await Promise.all([
        this.gemini.invokeStructured(GeminiBatchKeywordEnrichSchema, [
          { role: 'user', content: this.getBatchEnrichmentPrompt(state.identifiedKeywords) }
        ]),
        Promise.all(wordItems.map(item => this.fetchDictionaryIpa(item.word)))
      ]);
      
      // Map kết quả Dictionary API
      const dictMap = new Map<string, { ipa: string, audioUrl: string }>();
      wordItems.forEach((item, index) => {
        if (dictResults[index]) {
          dictMap.set(item.word.toLowerCase(), dictResults[index]!);
        }
      });

      const enrichedKeywords = [];
      for (const item of state.identifiedKeywords) {
        const geminiData = parsed.items.find((g: any) => g.word.toLowerCase() === item.word.toLowerCase());
        if (geminiData) {
          const dictInfo = dictMap.get(item.word.toLowerCase());
          
          enrichedKeywords.push({
            word: item.word,
            ipa: dictInfo?.ipa || '', 
            audioUrl: dictInfo?.audioUrl || '',
            level: item.level,
            explanation: geminiData.explanation,
            wordFamily: geminiData.wordFamily,
            collocations: geminiData.collocations,
          });
        }
      }

      this.logger.log(`✅ Giải nghĩa thành công ${enrichedKeywords.length} từ vựng.`);
      return { keywords: enrichedKeywords as any }; // Bỏ qua validate strict kiểu của IPA
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Keyword Enricher: ${err.message}`);
      return { keywords: [] };
    }
  }
}
