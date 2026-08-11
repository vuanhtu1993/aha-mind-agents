import { Annotation } from '@langchain/langgraph';

// "Bộ nhớ" của Agent — truyền qua lại giữa các Node
export const StoryShadowingState = Annotation.Root({
  // === INPUT ===
  rawText: Annotation<string>(),       // Văn bản thô do người dùng nhập (cho text pipeline)
  voice: Annotation<string>(),         // Giọng đọc do người dùng chọn
  youtubeUrl: Annotation<string>(),    // Link youtube (cho youtube pipeline)
  
  // === CONFIG ===
  config: Annotation<any>(),           // Chứa AgentConfig (Model, System Prompts...) đọc từ DB
  
  // === Execution Log ===
  error: Annotation<string | null>(),
  tokenUsage: Annotation<{ promptTokens: number; completionTokens: number; totalTokens: number }>({
    reducer: (prev, curr) => ({
      promptTokens: (prev?.promptTokens || 0) + (curr?.promptTokens || 0),
      completionTokens: (prev?.completionTokens || 0) + (curr?.completionTokens || 0),
      totalTokens: (prev?.totalTokens || 0) + (curr?.totalTokens || 0),
    }),
    default: () => ({ promptTokens: 0, completionTokens: 0, totalTokens: 0 }),
  }),

  // === Intermediate Output: YoutubeFetcher ===
  youtubeTitle: Annotation<string>(),
  youtubeVideoId: Annotation<string>(),
  youtubeTranscript: Annotation<Array<{ text: string; offset: number; duration: number }>>({
    reducer: (_, y) => y,
  }),

  // === Output: SentenceSplitter / YoutubeConsolidator ===
  level: Annotation<'easy' | 'medium' | 'hard'>(), // Độ khó do AI đánh giá
  rawSentences: Annotation<Array<{ id: number; text: string; words: { word: string; ipa: string }[] }>>({
    reducer: (_, y) => y,              // Overwrite toàn bộ mảng (không concat)
  }),

  // === Output: TtsGenerator ===
  speakingRate: Annotation<number>(),  // Tốc độ đọc tương ứng
  // Mảng câu đã kèm audio base64 và IPA
  sentences: Annotation<Array<{ id: number; text: string; audioBase64: string; words?: { word: string; ipa: string }[] }>>({
    reducer: (_, y) => y,
  }),

  // === Intermediate Output: KeywordIdentifier ===
  identifiedKeywords: Annotation<Array<{
    word: string;
    type: 'word' | 'idiom' | 'phrasal_verb';
    context: string;
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  }>>({
    reducer: (_, y) => y,
  }),

  // === Final Output: KeywordEnricher ===
  keywords: Annotation<Array<{ 
    word: string; 
    explanation: string; 
    level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
    ipa?: string;
    audioUrl?: string;
    wordFamily?: any[];
    collocations?: any[];
  }>>({
    reducer: (_, y) => y,
  }),
});

export type StoryShadowingStateType = typeof StoryShadowingState.State;
