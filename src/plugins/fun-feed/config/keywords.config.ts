/**
 * Danh mục từ khóa tìm kiếm nội dung hài hước tiếng Anh theo chủ đề.
 * Quản lý tĩnh qua code thay vì database để tối ưu hóa hiệu năng và tuân thủ YAGNI.
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
  { keyword: 'english grammar meme', topic: 'grammar', source: 'all' },
  { keyword: 'past tense funny english', topic: 'grammar', source: 'giphy' },
  { keyword: 'grammar police english', topic: 'grammar', source: 'all' },
  // Idioms
  { keyword: 'english idioms funny', topic: 'idiom', source: 'all' },
  { keyword: 'break a leg meme funny', topic: 'idiom', source: 'giphy' },
  { keyword: 'literal idioms english funny', topic: 'idiom', source: 'youtube' },
  // Pronunciation
  { keyword: 'english pronunciation funny meme', topic: 'pronunciation', source: 'all' },
  { keyword: 'silent letters english meme', topic: 'pronunciation', source: 'all' },
  // Vocabulary
  { keyword: 'confusing english words meme', topic: 'vocabulary', source: 'all' },
  { keyword: 'english false friends vocabulary funny', topic: 'vocabulary', source: 'all' },
  // Conversation
  { keyword: 'awkward english conversation meme', topic: 'conversation', source: 'all' },
];
