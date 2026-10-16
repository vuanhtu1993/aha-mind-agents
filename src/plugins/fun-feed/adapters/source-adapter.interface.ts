export interface NormalizedMedia {
  source: 'giphy' | 'youtube' | 'generated';
  sourceId: string;
  sourceUrl: string;
  type: 'gif' | 'image' | 'video' | 'short_video';
  title: string;
  mediaUrl: string;
  thumbnailUrl?: string;
  attribution?: string;
  rating?: string;
}

export interface SourceReport {
  source: string;
  status: 'ok' | 'missing_key' | 'error';
  count: number;
  message?: string;
}

export interface SourceAdapter {
  readonly source: string;
  fetch(keyword: string, limit?: number): Promise<NormalizedMedia[]>;
  fetchWithReport?(keyword: string, limit?: number): Promise<{ items: NormalizedMedia[]; report: SourceReport }>;
}
