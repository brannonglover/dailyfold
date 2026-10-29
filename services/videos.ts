import { API_URL } from '@/constants/api';
import { apiUnreachableMessage, fetchWithTimeout, parseJson, resolveArticleDisplayFields } from '@/services/articles';
import { FeedVideo, Topic } from '@/types';

export const VIDEO_PAGE_SIZE = 12;

export function feedVideoKey(video: FeedVideo): string {
  return video.kind === 'article' ? video.articleId : video.videoId;
}

interface VideosResponse {
  videos: FeedVideo[];
  meta?: {
    hasMore?: boolean;
    nextCursor?: string | null;
    /** First page only: topics that have at least one video. */
    availableTopics?: Topic[];
  };
}

export interface FetchVideosOptions {
  cursor?: string;
  topic?: Topic | null;
  limit?: number;
}

export interface FetchVideosResult {
  videos: FeedVideo[];
  hasMore: boolean;
  nextCursor: string | null;
  availableTopics?: Topic[];
}

export async function fetchVideos(options?: FetchVideosOptions): Promise<FetchVideosResult> {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? VIDEO_PAGE_SIZE));
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.topic) params.set('topics', options.topic);

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}/api/videos?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) throw error;
    throw new Error(apiUnreachableMessage());
  }

  const data = await parseJson<VideosResponse>(response);
  return {
    videos: data.videos.map((video) =>
      video.kind === 'article'
        ? { ...video, article: resolveArticleDisplayFields(video.article) }
        : video,
    ),
    hasMore: data.meta?.hasMore === true,
    nextCursor: data.meta?.nextCursor ?? null,
    availableTopics: data.meta?.availableTopics,
  };
}
