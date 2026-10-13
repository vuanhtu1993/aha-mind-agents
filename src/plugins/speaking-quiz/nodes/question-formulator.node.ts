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

const SYSTEM_PROMPT = `You are an expert English language educator and communicative speech coach.
Your task is to craft a thought-provoking, concise, and punchy open-ended question based on the provided topic, context, and target keywords.

Pedagogical Rules:
1. STRICTLY FORBIDDEN: 
   - Do NOT create fact-retrieval questions (e.g., "What happened in the story?" or "Who did X?").
   - Do NOT include background introductions, preamble context, or multi-clause setups in the question itself.
2. DIVERSE QUESTION INTENTS (Select the most engaging angle for the topic):
   - Debate / Opinion: Core stance or controversy (e.g., "Should...", "Is it better to... or...").
   - Suggestion / Problem-Solving: Practical advice or solutions (e.g., "What measures should companies take to...", "How can one best handle...").
   - Situational / Decision-Making: Ethical choices or realistic dilemmas (e.g., "If you had to compromise between... and..., what would you prioritize?").
   - Experience / Reflection: Thoughtful personal reflection on a principle (e.g., "How would you handle a colleague who...").
3. CONCISENESS & DIRECTNESS (CRITICAL):
   - The question MUST be direct and strictly UNDER 20 WORDS (optimal range: 12 - 18 words).
   - Go straight to the dilemma or prompt without filler words.
4. Tailor vocabulary and grammatical structure strictly to CEFR level {LEVEL}:
   - B1: Clear, straightforward choices and scenarios (accessible syntax).
   - B2: Contemporary societal issues, balancing advantages vs disadvantages.
   - C1: Complex systemic trade-offs, philosophical or organizational diplomacy.
5. Output must strictly conform to the required JSON schema.`;

@Injectable()
export class QuestionFormulatorNode {
  private readonly logger = new Logger(QuestionFormulatorNode.name);

  constructor(private readonly hive: HiveService) { }

  public async invoke(state: SpeakingQuizStateType): Promise<Partial<SpeakingQuizStateType>> {
    if (state.error || !state.resolvedTopic) return {};

    this.logger.log(`Đang sinh câu hỏi luyện nói cho chủ đề: "${state.resolvedTopic}" [Level: ${state.level}]`);

    const promptTemplate = SYSTEM_PROMPT.replace('{LEVEL}', state.level || 'B2');
    const keywordList = (state.targetKeywords || []).map(k => k.word).join(', ');

    const frameworkHint = state.preferredFramework
      ? `Mandatory Target Framework: "${state.preferredFramework}". Ensure the question is formulated specifically for this framework.`
      : `Select the most natural suggestedFramework ('PAR', 'CCR', 'STAR', or 'PREP') for this topic.
   - For problem-solving, career advice, overcoming difficulties, or practical recommendations: formulate a 'How can/should...' question and suggest 'PAR'.
   - For balancing two competing priorities, nuance, or trade-offs: formulate a balance question and suggest 'CCR'.
   - For personal reaction, case story, or behavioral scenarios: formulate a 'How would you handle...' question and suggest 'STAR'.
   - For sharp controversies or policy decisions: formulate a direct stance question ('Should...') and suggest 'PREP'.
   DO NOT default to 'PREP' if advice (PAR) or trade-offs (CCR) are more engaging for the learner.`;

    const userPrompt = `Topic: ${state.resolvedTopic}
Context Summary: ${state.sourceContentSummary || 'No extra summary.'}
Target Keywords to stimulate: ${keywordList || 'None specified'}
Target CEFR Level: ${state.level || 'B2'}
${frameworkHint}

Generate a punchy, spoken English prompt (under 20 words) and specify the suggestedFramework.`;

    try {
      const response = await this.hive.invokeStructured(
        QuestionFormulatorOutputSchema,
        [
          { role: 'system', content: promptTemplate },
          { role: 'user', content: userPrompt },
        ],
        { temperature: 0.3, name: 'question_formulator' },
      );

      const chosenFramework = state.preferredFramework || response.parsed.suggestedFramework || 'PAR';
      this.logger.log(`✅ Câu hỏi đã sinh: "${response.parsed.question}" (Khung: ${chosenFramework})`);

      return {
        generatedQuestion: response.parsed.question,
        selectedFramework: chosenFramework,
        tokenUsage: response.usage,
      };
    } catch (err: any) {
      this.logger.error(`❌ Lỗi sinh câu hỏi: ${err.message}`);
      return { error: `Không thể tạo câu hỏi luyện nói: ${err.message}` };
    }
  }
}
