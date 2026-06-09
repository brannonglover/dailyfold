import { API_URL } from '@/constants/api';
import { decodeFeedText } from '@/catalog/decodeHtmlText';
import { resolveArticleImageUrl } from '@/constants/images';
import { ARTICLES } from '@/data/articles';
import { Article } from '@/types';
import { applyArticleStoryFallbacks } from '@/utils/articleStoryFallback';

interface ArticlesResponse {
  articles: Article[];
  meta?: {
    lastIngestAt: string | null;
    ingestTriggered?: boolean;
    ingestAwaited?: boolean;
    hasMore?: boolean;
    nextCursor?: string | null;
    count?: number;
  };
}

export interface FetchArticlesResult {
  articles: Article[];
  meta?: ArticlesResponse['meta'] & { usingFallback?: boolean };
}

export interface FetchArticlesOptions {
  forceRefresh?: boolean;
  sourceIds?: string[];
  cursor?: string;
  limit?: number;
}

interface ArticleResponse {
  article: Article;
}

/** Page size for initial load and infinite scroll. */
export const ARTICLE_PAGE_SIZE = 80;
const FETCH_TIMEOUT_MS = 12_000;
/** First page may wait on cold-start ingest; allow longer than paginated requests. */
const INITIAL_FETCH_TIMEOUT_MS = 60_000;

const EMPTY_FEED_MESSAGE =
  'No articles in the feed yet. Run "npm run api:ingest" to fetch stories from your sources.';

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Request timed out. Check your connection and try again.');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error?.trim()) return body.error.trim();
  } catch {
    // ignore non-JSON bodies
  }
  return `API error: ${response.status}`;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(
        'API returned unauthorized (HTTP ' +
          response.status +
          '). On Vercel, turn off Deployment Protection for Production or promote a public production deployment.',
      );
    }
    if (response.status === 404) {
      throw new Error(
        'API route not found (HTTP 404). Confirm the backend deployed successfully and EXPO_PUBLIC_API_URL points at that deployment.',
      );
    }
    throw new Error(await parseApiError(response));
  }
  return response.json() as Promise<T>;
}

function apiUnreachableMessage(): string {
  return `Cannot reach the API at ${API_URL}. Run "npm run api" (see DEV.md), verify with "npm run api:check", and on a physical device set EXPO_PUBLIC_API_URL in .env to your computer's LAN address (e.g. http://192.168.1.94:3001).`;
}

function withResolvedArticleFields(articles: Article[]): Article[] {
  const resolved = articles.map((article) => ({
    ...article,
    title: decodeFeedText(article.title),
    excerpt: decodeFeedText(article.excerpt),
    body: decodeFeedText(article.body),
    imageUrl: resolveArticleImageUrl(article.imageUrl),
  }));
  return applyArticleStoryFallbacks(resolved);
}

function buildArticlesSearchParams(options?: FetchArticlesOptions): URLSearchParams {
  const params = new URLSearchParams();
  params.set('limit', String(options?.limit ?? ARTICLE_PAGE_SIZE));
  if (options?.forceRefresh) params.set('refresh', 'true');
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.sourceIds && options.sourceIds.length > 0) {
    params.set('sources', options.sourceIds.join(','));
  }
  return params;
}

export async function fetchArticles(options?: FetchArticlesOptions): Promise<FetchArticlesResult> {
  const params = buildArticlesSearchParams(options);
  const isInitialPage = !options?.cursor;
  const timeoutMs = isInitialPage ? INITIAL_FETCH_TIMEOUT_MS : FETCH_TIMEOUT_MS;

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${API_URL}/api/articles?${params.toString()}`,
      { headers: { Accept: 'application/json' } },
      timeoutMs,
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      throw error;
    }
    throw new Error(apiUnreachableMessage());
  }

  const data = await parseJson<ArticlesResponse>(response);
  if (data.articles.length === 0 && isInitialPage) {
    const ingestPending = data.meta?.ingestTriggered && !data.meta?.ingestAwaited;
    if (ingestPending) {
      return { articles: [], meta: data.meta };
    }
    throw new Error(EMPTY_FEED_MESSAGE);
  }

  return { articles: withResolvedArticleFields(data.articles), meta: data.meta };
}

const BUNDLED_DEMO_IDS = new Set(ARTICLES.map((article) => article.id));

function bundledDemoArticle(id: string): Article | undefined {
  const demo = ARTICLES.find((article) => article.id === id);
  return demo ? withResolvedArticleFields([demo])[0] : undefined;
}

export async function fetchArticleById(id: string): Promise<Article | undefined> {
  try {
    const response = await fetch(`${API_URL}/api/articles/${id}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.ok) {
      const data = await parseJson<ArticleResponse>(response);
      return data.article ? withResolvedArticleFields([data.article])[0] : undefined;
    }
    if (response.status === 404 && __DEV__ && BUNDLED_DEMO_IDS.has(id)) {
      return bundledDemoArticle(id);
    }
    return undefined;
  } catch {
    if (__DEV__ && BUNDLED_DEMO_IDS.has(id)) {
      return bundledDemoArticle(id);
    }
    return undefined;
  }
}
