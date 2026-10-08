/**
 * @file prep-synthesizer.node.ts
 * @description Node 3 trong StateGraph: Tổng hợp giàn giáo PREP (Point, Reason, Example, Conclusion)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../core/gemini/gemini.service';
import { HiveService } from 'src/core/hive/hive.service';
import { PrepSynthesizerOutputSchema } from '../speaking-quiz.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

const SYSTEM_PROMPT = `You are a master speech coach and English pedagogue.
Your objective is to build a complete 4-stage PREP scaffolding structure (Point, Reason, Example, Conclusion) for the learner to construct their spoken speech.

Each of the 4 stages must strictly contain:
1. "title": "Point", "Reason", "Example", or "Conclusion".
2. "signposts": A list of at least 2 natural discourse markers / transition phrases suitable for CEFR level {LEVEL}.
3. "hint": A practical instruction guiding what the student should say in Vietnamese or accessible English.
4. "modelAnswer": A natural, high-scoring sample sentence conforming to CEFR level {LEVEL}.

CRITICAL INTEGRATION RULE:
Incorporate at least 2 of the target vocabulary items naturally into the model answers across the 4 stages.`;

@Injectable()
export class PrepSynthesizerNode {
  private readonly logger = new Logger(PrepSynthesizerNode.name);

  constructor(private readonly hive: HiveService) { }

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.generatedQuestion) return {};

    this.logger.log(`Đang tổng hợp giàn giáo PREP cho câu hỏi: "${state.generatedQuestion}"`);

    const promptTemplate = SYSTEM_PROMPT.replace(/{LEVEL}/g, state.level || 'B2');
    const keywordStr = (state.targetKeywords || [])
      .map(k => `"${k.word}" (${k.meaning})`)
      .join(', ');

    const userPrompt = `Topic: ${state.resolvedTopic}
Debate Question: ${state.generatedQuestion}
Target Keywords to Integrate: ${keywordStr || 'General high-frequency debate terms'}
CEFR Level: ${state.level}

Construct the full PREP scaffolding with all 4 stages: point, reason, example, conclusion.`;

    const maxRetries = 2;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const response = await this.hive.invokeStructured(
          PrepSynthesizerOutputSchema,
          [
            { role: 'system', content: promptTemplate },
            { role: 'user', content: attempt === 0 ? userPrompt : `${userPrompt}\n\nNote: Ensure all 4 stages are complete and valid.` },
          ],
          { temperature: 0.2, name: 'prep_synthesizer' },
        );

        this.logger.log(`✅ Giàn giáo PREP hoàn thành sau ${attempt + 1} lần thực thi.`);
        return {
          prepScaffold: response.parsed,
          tokenUsage: response.usage,
        };
      } catch (err: any) {
        attempt++;
        lastError = err;
        this.logger.warn(`⚠️ Lỗi sinh PREP (lần ${attempt}/${maxRetries + 1}): ${err.message}`);
      }
    }

    return { error: `Không thể tổng hợp giàn giáo PREP sau ${maxRetries + 1} lần thử: ${lastError?.message}` };
  }
}
