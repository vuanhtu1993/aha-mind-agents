/**
 * Danh mục từ khóa tìm kiếm nội dung hài hước tiếng Anh theo chủ đề.
 * Quản lý tĩnh qua code thay vì database để tối ưu hóa hiệu năng và tuân thủ YAGNI.
 *
 * Lưu ý quan trọng:
 * GIPHY tìm kiếm theo Tag/Keyword ngắn gọn (1-2 từ). Nếu dùng cụm từ quá dài (như "past tense funny english"),
 * GIPHY sẽ trả về 0 kết quả do cơ chế AND giữa các tag.
 *
 * Made by Anh Tu - Share to be share
 */
export interface KeywordItem {
  keyword: string;
  topic: 'grammar' | 'vocabulary' | 'pronunciation' | 'idiom' | 'conversation';
  source: 'giphy' | 'youtube' | 'all';
}

export const FUNNY_KEYWORDS_POOL: KeywordItem[] = [
  // 1. Trending Hashtags (YouTube Shorts & Reels Creator Community)
  { keyword: '#englishmeme', topic: 'grammar', source: 'all' },
  { keyword: '#learnenglish #funny', topic: 'conversation', source: 'all' },
  { keyword: '#grammarpolice', topic: 'grammar', source: 'all' },
  { keyword: '#englishhumor', topic: 'conversation', source: 'all' },
  { keyword: '#eslhumor', topic: 'conversation', source: 'all' },
  { keyword: '#englishjokes', topic: 'conversation', source: 'all' },
  { keyword: '#pronunciationchallenge', topic: 'pronunciation', source: 'all' },
  { keyword: '#britishvsamerican', topic: 'pronunciation', source: 'all' },
  { keyword: '#englishfail', topic: 'grammar', source: 'all' },
  { keyword: '#idiomsoftheday #funny', topic: 'idiom', source: 'all' },
  { keyword: '#funnyenglish', topic: 'conversation', source: 'all' },
  { keyword: '#confusingenglish', topic: 'vocabulary', source: 'all' },

  // 2. Grammar & Sentence Structure Fails
  { keyword: 'english grammar meme', topic: 'grammar', source: 'all' },
  { keyword: 'grammar police', topic: 'grammar', source: 'all' },
  { keyword: 'past tense funny', topic: 'grammar', source: 'all' },
  { keyword: 'oxford comma meme', topic: 'grammar', source: 'all' },
  { keyword: "their there they're meme", topic: 'grammar', source: 'all' },
  { keyword: 'autocorrect english fail', topic: 'grammar', source: 'all' },
  { keyword: 'irregular verbs meme', topic: 'grammar', source: 'all' },
  { keyword: 'passive voice funny', topic: 'grammar', source: 'all' },
  { keyword: 'apostrophe fail', topic: 'grammar', source: 'all' },
  { keyword: 'punctuation saves lives', topic: 'grammar', source: 'all' },

  // 3. Pronunciation & Accents
  { keyword: 'silent letters english', topic: 'pronunciation', source: 'all' },
  { keyword: 'english pronunciation meme', topic: 'pronunciation', source: 'all' },
  { keyword: 'british accent vs american accent', topic: 'pronunciation', source: 'all' },
  { keyword: 'tongue twister challenge', topic: 'pronunciation', source: 'all' },
  { keyword: 'misheard lyrics english', topic: 'pronunciation', source: 'all' },
  { keyword: 'accent challenge funny', topic: 'pronunciation', source: 'all' },
  { keyword: 'pronouncing english words wrong', topic: 'pronunciation', source: 'all' },
  { keyword: 'australian slang vs british', topic: 'pronunciation', source: 'all' },

  // 4. Idioms, Slang & Figurative Language
  { keyword: 'idioms taken literally', topic: 'idiom', source: 'all' },
  { keyword: 'english idioms funny', topic: 'idiom', source: 'all' },
  { keyword: 'break a leg meme', topic: 'idiom', source: 'all' },
  { keyword: 'piece of cake idiom', topic: 'idiom', source: 'all' },
  { keyword: 'bite the bullet meme', topic: 'idiom', source: 'all' },
  { keyword: 'gen z slang english', topic: 'idiom', source: 'all' },
  { keyword: 'british slang funny', topic: 'idiom', source: 'all' },
  { keyword: 'english idioms animation', topic: 'idiom', source: 'all' },

  // 5. Vocabulary, Spelling & Confusing Words
  { keyword: 'confusing english words', topic: 'vocabulary', source: 'all' },
  { keyword: 'english spelling makes no sense', topic: 'vocabulary', source: 'all' },
  { keyword: 'homophones funny english', topic: 'vocabulary', source: 'all' },
  { keyword: 'false friends english', topic: 'vocabulary', source: 'all' },
  { keyword: 'spelling bee fail', topic: 'vocabulary', source: 'all' },
  { keyword: 'english vocabulary meme', topic: 'vocabulary', source: 'all' },
  { keyword: 'synonyms gone wrong', topic: 'vocabulary', source: 'all' },
  { keyword: 'long english words funny', topic: 'vocabulary', source: 'all' },

  // 6. Real-life Conversation & Learning Struggles
  { keyword: 'when you try to speak english', topic: 'conversation', source: 'all' },
  { keyword: 'ordering food in english funny', topic: 'conversation', source: 'all' },
  { keyword: 'job interview in english funny', topic: 'conversation', source: 'all' },
  { keyword: 'english teacher meme', topic: 'conversation', source: 'all' },
  { keyword: 'speaking english with native speaker', topic: 'conversation', source: 'all' },
  { keyword: 'when your english is bad', topic: 'conversation', source: 'all' },
  { keyword: 'thinking in english meme', topic: 'conversation', source: 'all' },
  { keyword: 'english class funny moments', topic: 'conversation', source: 'all' },
];
