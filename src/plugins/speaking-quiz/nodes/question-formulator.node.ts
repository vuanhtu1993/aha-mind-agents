/**
 * @file question-formulator.node.ts
 * @description Node 2 trong StateGraph: Tạo câu hỏi tranh luận (Thought-provoking prompt)
 *
 * Made by Anh Tu - Share to be share
 */

import { Injectable, Logger } from '@nestjs/common';
import { GeminiService } from '../../../core/gemini/gemini.service';
import { HiveService } from 'src/core/hive/hive.service';
import { QuestionFormulatorOutputSchema } from '../speaking-quiz.schema';
import { SpeakingQuizStateType } from '../speaking-quiz.state';

const SYSTEM_PROMPT = `You are an expert English language educator and debate coach.
Your task is to craft a thought-provoking, concise, and punchy open-ended debate question based on the provided topic, context, and target vocabulary.

Pedagogical Rules:
1. STRICTLY FORBIDDEN: 
   - Do NOT create fact-retrieval questions (e.g., "What happened in the story?" or "Who did X?").
   - Do NOT include background introductions, preamble context, or multi-clause setups in the question itself.
2. CONCISENESS & DIRECTNESS (CRITICAL):
   - The question MUST be direct and strictly UNDER 20 WORDS (optimal range: 12 - 18 words).
   - Go straight to the core dilemma using decisive starters (e.g., "Should...", "Is it better to... or...", "Do you agree that...").
3. The question MUST stimulate personal opinion, ethical dilemmas, or societal perspectives with at least two viable opposing sides.
4. Tailor vocabulary and grammatical structure strictly to CEFR level {LEVEL}:
   - B1: Clear, straightforward moral or daily life choices (simple syntax).
   - B2: Contemporary societal issues, balancing advantages vs disadvantages.
   - C1: Complex ethical, philosophical, or systemic trade-offs.
5. Output must strictly conform to the required JSON schema.`;

@Injectable()
export class QuestionFormulatorNode {
  private readonly logger = new Logger(QuestionFormulatorNode.name);

  constructor(private readonly hive: HiveService) { }

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.resolvedTopic) return {};

    this.logger.log(`Đang sinh câu hỏi tranh luận cho chủ đề: "${state.resolvedTopic}" [Level: ${state.level}]`);

    const promptTemplate = SYSTEM_PROMPT.replace('{LEVEL}', state.level || 'B2');
    const keywordList = (state.targetKeywords || []).map(k => k.word).join(', ');

    const userPrompt = `Topic: ${state.resolvedTopic}
Context Summary: ${state.sourceContentSummary || 'No extra summary.'}
Target Keywords to stimulate: ${keywordList || 'None specified'}
Target CEFR Level: ${state.level}

Generate a punchy, concise debate question (under 20 words) that directly invites the learner to take a stand.`;

    try {
      const response = await this.hive.invokeStructured(
        QuestionFormulatorOutputSchema,
        [
          { role: 'system', content: promptTemplate },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, name: 'question_formulator' },
      );

      this.logger.log(`✅ Câu hỏi đã sinh: "${response.parsed.question}"`);

      return {
        generatedQuestion: response.parsed.question,
        tokenUsage: response.usage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi sinh câu hỏi: ${err.message}`);
      return { error: `Không thể tạo câu hỏi tranh luận: ${err.message}` };
    }
  }
}
