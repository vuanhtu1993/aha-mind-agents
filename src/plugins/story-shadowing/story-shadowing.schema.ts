import { z } from 'zod';

// Schema cho 1 từ kèm phiên âm IPA
export const WordSchema = z.object({
  word: z.string(),   // Từ gốc (giữ nguyên cách viết trong câu)
  ipa: z.string(),    // Phiên âm IPA, ví dụ: /ˈbəʊtnəs/
});

export type Word = z.infer<typeof WordSchema>;

export const GeminiYoutubeConsolidatedSchema = z.object({
  level: z.enum(['easy', 'medium', 'hard']),
  sentences: z.array(
    z.object({
      id: z.number(),
      text: z.string(),
      startMs: z.number(),
      endMs: z.number(),
      words: z.array(WordSchema),
    })
  ),
});

// Schema trả về từ Gemini khi chia câu (raw, chưa có audio)
export const GeminiSentenceListSchema = z.object({
  level: z.enum(['easy', 'medium', 'hard']),
  sentences: z.array(z.object({
    id: z.number(),
    text: z.string(),
    words: z.array(WordSchema),
  })),
});

// Schema trả về từ Gemini khi xác định từ khó (Step 1)
export const IdentifiedKeywordListSchema = z.object({
  items: z.array(z.object({
    word: z.string(),           // Từ hoặc cụm từ (idiom giữ nguyên cả cụm)
    type: z.enum(['word', 'idiom', 'phrasal_verb']),
    context: z.string(),        // Câu chứa từ này để giúp giải thích đúng nghĩa
    level: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  }))
});

export type IdentifiedKeywordItem = z.infer<typeof IdentifiedKeywordListSchema>['items'][0];

// Schema trả về từ Gemini khi enrich nhiều items cùng lúc
export const GeminiBatchKeywordEnrichSchema = z.object({
  items: z.array(z.object({
    word: z.string(), // Để match lại với original item
    explanation: z.string(),
    wordFamily: z.array(z.object({
      word: z.string(),
      partOfSpeech: z.string().optional(),
      ipa: z.string().optional(),
      explanation: z.string()
    })).optional(),
    collocations: z.array(z.object({
      collocation: z.string(),
      explanation: z.string()
    })).optional(),
  }))
});
