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
  // Grammar
  { keyword: 'english grammar', topic: 'grammar', source: 'all' },
  { keyword: 'grammar police', topic: 'grammar', source: 'all' },
  { keyword: 'past tense', topic: 'grammar', source: 'all' },
  { keyword: 'grammar', topic: 'grammar', source: 'all' },

  // Idioms
  { keyword: 'idioms', topic: 'idiom', source: 'all' },
  { keyword: 'break a leg', topic: 'idiom', source: 'all' },
  { keyword: 'english idioms', topic: 'idiom', source: 'all' },

  // Pronunciation
  { keyword: 'pronunciation', topic: 'pronunciation', source: 'all' },
  { keyword: 'silent letters', topic: 'pronunciation', source: 'all' },

  // Vocabulary
  { keyword: 'vocabulary', topic: 'vocabulary', source: 'all' },
  { keyword: 'spelling', topic: 'vocabulary', source: 'all' },

  // Conversation & Culture
  { keyword: 'learning english', topic: 'conversation', source: 'all' },
  { keyword: 'english teacher', topic: 'conversation', source: 'all' },
  { keyword: 'english class', topic: 'conversation', source: 'all' },
];
