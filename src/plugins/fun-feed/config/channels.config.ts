/**
 * Danh mục các kênh sáng tạo nội dung YouTube Shorts tuyển chọn (Curated Channels)
 * phục vụ thu thập tự động theo ngày cho Aha Fun Feed.
 *
 * Triết lý thiết kế (Human-Friendly Configuration):
 * - Người dùng/Operator chỉ cần cung cấp handle thân thiện (ví dụ: @bbclearningenglish).
 * - Hệ thống sẽ tự động phân giải (Resolve) sang Channel ID (UC...) và Uploads Playlist ID (UU...).
 *
 * Made by Anh Tu - Share to be share
 */

export interface YoutubeChannelConfig {
  /** Handle của kênh YouTube (ví dụ: @bbclearningenglish hoặc bbclearningenglish) */
  handle: string;
  /** Chủ đề tiếng Anh chủ đạo của kênh */
  defaultTopic: 'grammar' | 'vocabulary' | 'pronunciation' | 'idiom' | 'conversation';
  /** Trạng thái kích hoạt cào dữ liệu định kỳ */
  isActive: boolean;
  /** Tên hiển thị của kênh (tùy chọn - nếu không điền sẽ tự resolve từ YouTube) */
  name?: string;
  /** Mã định danh kênh YouTube bắt đầu bằng UC (tùy chọn - tự resolve từ handle) */
  channelId?: string;
  /** Playlist ID chứa toàn bộ video tải lên (tùy chọn - tự sinh từ channelId) */
  uploadsPlaylistId?: string;
}

/**
 * Chuyển đổi YouTube Channel ID sang Uploads Playlist ID.
 * Quy tắc kỹ thuật của YouTube: Thay thế tiền tố 'UC' thành 'UU'.
 * Ví dụ: 'UCHaHD477h-FeBbVh9Sh7syA' -> 'UUHaHD477h-FeBbVh9Sh7syA'.
 */
export function getUploadsPlaylistId(channelId: string): string {
  if (channelId.startsWith('UC')) {
    return 'UU' + channelId.slice(2);
  }
  return channelId;
}

/**
 * Chuẩn hóa handle YouTube: Đảm bảo có tiền tố @ và loại bỏ khoảng trắng thừa.
 */
export function normalizeHandle(handle: string): string {
  const clean = handle.trim();
  return clean.startsWith('@') ? clean : `@${clean}`;
}

export const CURATED_YOUTUBE_CHANNELS: YoutubeChannelConfig[] = [
  {
    handle: '@bbclearningenglish',
    name: 'BBC Learning English',
    defaultTopic: 'grammar',
    isActive: true,
    channelId: 'UCHaHD477h-FeBbVh9Sh7syA',
    uploadsPlaylistId: 'UUHaHD477h-FeBbVh9Sh7syA',
  },
  {
    handle: '@LearnEnglishWithTVSeries',
    name: 'Learn English With TV Series',
    defaultTopic: 'conversation',
    isActive: true,
    channelId: 'UCKgpamMwp55x6wTG0dZcx0Q',
    uploadsPlaylistId: 'UUKgpamMwp55x6wTG0dZcx0Q',
  },
  {
    handle: '@EnglishwithLucy',
    name: 'English with Lucy',
    defaultTopic: 'pronunciation',
    isActive: true,
    channelId: 'UCz4tgANd4yy8Oe0iXCdSWnw',
    uploadsPlaylistId: 'UUz4tgANd4yy8Oe0iXCdSWnw',
  },
  {
    handle: '@DanHauer',
    name: 'Dan Hauer',
    defaultTopic: 'pronunciation',
    isActive: true,
    channelId: 'UCi_7j1n9Xv70p8Yp66uTzkg',
    uploadsPlaylistId: 'UUi_7j1n9Xv70p8Yp66uTzkg',
  },
  {
    handle: '@papateachme',
    name: 'Papa Teach Me',
    defaultTopic: 'idiom',
    isActive: true,
    channelId: 'UCVBErcpqaokOf4fI5j73K_w',
    uploadsPlaylistId: 'UUVBErcpqaokOf4fI5j73K_w',
  },
];
