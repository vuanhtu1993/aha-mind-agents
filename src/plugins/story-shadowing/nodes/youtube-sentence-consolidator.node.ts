import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../core/gemini/gemini.service';
import { GeminiYoutubeConsolidatedSchema } from '../story-shadowing.schema';
import { StoryShadowingStateType } from '../story-shadowing.state';

const SYSTEM_PROMPT = `You are an expert linguist and audio synchronizer.
The user will provide a raw transcript array from a YouTube video where each item is a caption block with 'text', 'start' (in ms) and 'duration' (in ms).
These blocks are often broken mid-sentence.

Your task:
1. Merge the blocks into complete, grammatically correct English sentences.
2. For each merged sentence, calculate:
   - startMs: the 'start' value of the VERY FIRST block in that sentence.
   - endMs: the ('start' + 'duration') value of the VERY LAST block in that sentence.
3. For each sentence, provide phonetic transcription (IPA) for EVERY word in the sentence as an array of { word, ipa }. Use broad IPA transcription. Attach punctuation to the preceding word.
4. Classify the overall language difficulty of the text into "easy", "medium", or "hard".
   - easy: A1-A2, short sentences, basic vocabulary.
   - medium: B1-B2, some idioms, complex sentences.
   - hard: C1+, technical jargon, advanced grammar.

Output EXACTLY a JSON matching this schema:
{
  "level": "medium",
  "sentences": [
    {
      "id": 0,
      "text": "This is a merged sentence.",
      "startMs": 0,
      "endMs": 4000,
      "words": [{"word": "This", "ipa": "/ðɪs/"}, {"word": "is", "ipa": "/ɪz/"}, ...]
    }
  ]
}

CRITICAL RULE:
Do NOT paraphrase the text. Keep the exact original words, just fix the punctuation and capitalization to form proper sentences.
Do NOT lose any audio gap, endMs MUST be the exact end time of the last block forming the sentence.`;

@Injectable()
export class YoutubeSentenceConsolidatorNode {
  private readonly logger = new Logger(YoutubeSentenceConsolidatorNode.name);

  constructor(private readonly gemini: GeminiService) { }

  public async invoke(state: StoryShadowingStateType): Promise<Partial<StoryShadowingStateType>> {
    if (state.error || !state.youtubeTranscript) return {};

    this.logger.log('Đang gộp phụ đề và căn chỉnh thời gian bằng AI...');

    try {
      const MAX_BLOCKS = 400;
      const CHUNK_SIZE = 100;
      const transcriptToProcess = state.youtubeTranscript.slice(0, MAX_BLOCKS);

      const chunkPromises = [];
      const chunkOffsets: number[] = [];

      const nodeConfig = state.config?.nodeOverrides?.['youtubeConsolidator'] || {};
      const prompt = nodeConfig.systemPrompt || SYSTEM_PROMPT;
      const temp = nodeConfig.temperature ?? state.config?.temperature ?? 0.1;
      const model = nodeConfig.model || state.config?.defaultModel;

      for (let i = 0; i < transcriptToProcess.length; i += CHUNK_SIZE) {
        const chunk = transcriptToProcess.slice(i, i + CHUNK_SIZE);
        const timeOffset = chunk[0].offset;
        chunkOffsets.push(timeOffset);

        const shiftedChunk = chunk.map(c => ({
          ...c,
          start: c.offset - timeOffset, // Map offset to start for the prompt
        }));

        const inputText = JSON.stringify(shiftedChunk);

        chunkPromises.push(
          this.gemini.invokeStructured(
            GeminiYoutubeConsolidatedSchema,
            [
              { role: 'system', content: prompt },
              { role: 'user', content: inputText },
            ],
            { temperature: temp, model: model }
          )
        );
      }

      const chunkResults = await Promise.all(chunkPromises);

      let allSentences: any[] = [];
      let overallLevel = chunkResults[0]?.parsed?.level || 'medium';

      let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

      let currentId = 0;
      for (let i = 0; i < chunkResults.length; i++) {
        const parsed = chunkResults[i].parsed;
        const usage = chunkResults[i].usage;

        totalUsage.promptTokens += usage.promptTokens;
        totalUsage.completionTokens += usage.completionTokens;
        totalUsage.totalTokens += usage.totalTokens;

        const offset = chunkOffsets[i];
        for (const s of parsed.sentences) {
          s.id = currentId++;
          s.startMs += offset;
          s.endMs += offset;
          allSentences.push(s);
        }
      }

      // Xử lý nội suy thời gian
      let i = 0;
      while (i < allSentences.length) {
        let j = i;
        while (j < allSentences.length && allSentences[j].startMs === allSentences[i].startMs && allSentences[j].endMs === allSentences[i].endMs) {
          j++;
        }
        const count = j - i;
        if (count > 1) {
          const totalDuration = allSentences[i].endMs - allSentences[i].startMs;
          let totalChars = 0;
          for (let k = i; k < j; k++) {
            totalChars += allSentences[k].text.length;
          }

          let currentStart = allSentences[i].startMs;
          for (let k = i; k < j; k++) {
            const ratio = allSentences[k].text.length / (totalChars || 1);
            const duration = totalDuration * ratio;
            allSentences[k].startMs = Math.floor(currentStart);
            allSentences[k].endMs = Math.floor(currentStart + duration);
            currentStart += duration;
          }
        }
        i = j;
      }

      // Fix Overlap
      for (let i = 0; i < allSentences.length - 1; i++) {
        const current = allSentences[i];
        const next = allSentences[i + 1];

        if (current.endMs > next.startMs) {
          if (next.startMs > current.startMs) {
            const mid = Math.floor((current.endMs + next.startMs) / 2);
            current.endMs = mid;
            next.startMs = mid;
          } else {
            next.startMs = current.endMs;
          }
        }
      }

      this.logger.log(`✅ Đã gộp thành công ${allSentences.length} câu hoàn chỉnh.`);

      return {
        rawSentences: allSentences,
        level: overallLevel as 'easy' | 'medium' | 'hard',
        sentences: allSentences.map(s => ({ ...s, audioBase64: '' })), // Youtube không chạy qua TTS
        tokenUsage: totalUsage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi Youtube Consolidator: ${err.message}`);
      return { error: 'Không thể xử lý ngôn ngữ phụ đề. Vui lòng thử video khác ngắn hơn.' };
    }
  }
}
