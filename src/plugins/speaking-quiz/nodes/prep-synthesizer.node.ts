/**
 * @file prep-synthesizer.node.ts
 * @description Node 3 trong StateGraph: Tổng hợp giàn giáo PREP (Point, Reason, Example, Conclusion)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { HiveService } from 'src/core/hive/hive.service';
import {
  AdaptiveScaffoldOutputSchema,
  toLegacyPrepScaffold,
} from '../speaking-quiz.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

const SYSTEM_PROMPT = `You are a master speech coach, communication strategist, and English pedagogue.
Your objective is to build an adaptive 4-stage speaking scaffold and linguistic toolkit tailored to the question's communicative intent for CEFR level {LEVEL}.

STEP 1: CHOOSE THE OPTIMAL SPEAKING FRAMEWORK
Analyze the question and select the single best framework from:
- "PREP" (Point - Reason - Example - Point/Conclusion): Best for opinion, debate, direct stance questions.
- "PAR" (Problem - Advice/Action - Result/Alternative): Best for advice, recommendation, solving workplace or everyday problems.
- "STAR" (Situation - Task/Action - Result): Best for storytelling, past experiences, behavioral or case scenarios.
- "CCR" (Claim - Concession/Counter-argument - Resolution): Best for complex trade-offs, diplomacy, negotiations, nuanced discussions.

Provide:
- frameworkType: "PREP" | "PAR" | "STAR" | "CCR"
- frameworkName: User-friendly English name (e.g., "PAR (Problem - Advice - Result)")
- frameworkDescription: Brief explanation in Vietnamese of why this framework fits this topic (e.g., "Khung giải pháp tối ưu cho câu hỏi đề xuất lời khuyên và hành động thực tiễn")

STEP 2: EXTRACT TOPIC COLLOCATIONS & IDIOMS
Generate 2 to 4 native, natural collocations, phrasal verbs, or idioms specifically relevant to this topic and question.
For each item:
- "phrase": English collocation (e.g., "remote burn-out", "strike a balance")
- "meaning": Concise Vietnamese translation
- "ipa": (Optional) phonetic guide

STEP 3: BUILD 4 TAILORED STAGES
Each of the 4 stages (stage1, stage2, stage3, stage4) corresponds to the selected framework and must contain:
1. "stageKey": Short identifier (e.g., "problem", "advice", "result", or "point", "reason", "example", "conclusion").
2. "title": Descriptive stage title (e.g., "Problem Identification", "Actionable Advice", "Alternative View", "Expected Outcome").
3. "signposts": At least 2 natural discourse markers or transition phrases suited for CEFR {LEVEL}.
4. "hint": Practical, pedagogical guidance in Vietnamese advising the learner what to express.
5. "modelAnswer": A natural, authentic spoken sample response adhering to CEFR level {LEVEL}.

CRITICAL INTEGRATION RULE:
Smoothly weave the generated topic collocations into the model answers across the 4 stages. The language should sound authentic and spontaneous, not robotic.`;

@Injectable()
export class PrepSynthesizerNode {
  private readonly logger = new Logger(PrepSynthesizerNode.name);

  constructor(private readonly hive: HiveService) { }

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.generatedQuestion) return {};

    this.logger.log(`Đang tổng hợp giàn giáo thích ứng cho câu hỏi: "${state.generatedQuestion}"`);

    const promptTemplate = SYSTEM_PROMPT.replace(/{LEVEL}/g, state.level || 'B2');
    const keywordStr = (state.targetKeywords || [])
      .map(k => `"${k.word}" (${k.meaning})`)
      .join(', ');

    const userPrompt = `Topic: ${state.resolvedTopic}
Question: ${state.generatedQuestion}
Target Keywords: ${keywordStr || 'Topic-specific spoken vocabulary'}
CEFR Level: ${state.level || 'B2'}

Select the best framework (PREP, PAR, STAR, CCR), provide 2-4 native topic collocations with Vietnamese meanings, and construct all 4 stages.`;

    const maxRetries = 2;
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      try {
        const response = await this.hive.invokeStructured(
          AdaptiveScaffoldOutputSchema,
          [
            { role: 'system', content: promptTemplate },
            { role: 'user', content: attempt === 0 ? userPrompt : `${userPrompt}\n\nNote: Ensure all 4 stages and collocations are complete and valid.` },
          ],
          { temperature: 0.2, name: 'prep_synthesizer' },
        );

        this.logger.log(`✅ Giàn giáo thích ứng (${response.parsed.frameworkType}) hoàn thành sau ${attempt + 1} lần thực thi.`);
        return {
          adaptiveScaffold: response.parsed,
          prepScaffold: toLegacyPrepScaffold(response.parsed),
          tokenUsage: response.usage,
        };
      } catch (err: any) {
        attempt++;
        lastError = err;
        this.logger.warn(`⚠️ Lỗi sinh giàn giáo (lần ${attempt}/${maxRetries + 1}): ${err.message}`);
      }
    }

    return { error: `Không thể tổng hợp giàn giáo thích ứng sau ${maxRetries + 1} lần thử: ${lastError?.message}` };
  }
}
