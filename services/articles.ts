import { API_URL } from '@/constants/api';
import { decodeFeedText } from '@/catalog/decodeHtmlText';
import { resolveArticleImageUrl } from '@/constants/images';
import { ARTICLES } from '@/data/articles';
import { Article } from '@/types';

interface ArticlesResponse {
  articles: Article[];
  meta?: {
    lastIngestAt: string | null;
    ingestTriggered?: boolean;
    ingestAwaited?: boolean;
  };
}

export interface FetchArticlesResult {
  articles: Article[];
  meta?: ArticlesResponse['meta'] & { usingFallback?: boolean };
}

interface ArticleResponse {
  article: Article;
}

const ARTICLE_FETCH_LIMIT = 250;
const FETCH_TIMEOUT_MS = 12_000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function apiUnreachableMessage(): string {
  return `Cannot reach the API at ${API_URL}. Run "npm run api" (see DEV.md), verify with "npm run api:check", and on a physical device set EXPO_PUBLIC_API_URL in .env to your computer's LAN address (e.g. http://192.168.1.94:3001).`;
}

function withResolvedArticleFields(articles: Article[]): Article[] {
  return articles.map((article) => ({
    ...article,
    title: decodeFeedText(article.title),
    excerpt: decodeFeedText(article.excerpt),
    body: decodeFeedText(article.body),
    imageUrl: resolveArticleImageUrl(article.imageUrl),
  }));
}

function devFallbackArticles(): FetchArticlesResult {
  return {
    articles: withResolvedArticleFields(ARTICLES),
    meta: { lastIngestAt: null, usingFallback: true },
  };
}

export async function fetchArticles(options?: {
  forceRefresh?: boolean;
  sourceIds?: string[];
}): Promise<FetchArticlesResult> {
  const params = new URLSearchParams();
  params.set('limit', String(ARTICLE_FETCH_LIMIT));
  if (options?.forceRefresh) params.set('refresh', 'true');
  if (options?.sourceIds && options.sourceIds.length > 0) {
    params.set('sources', options.sourceIds.join(','));
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(`${API_URL}/api/articles?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('timed out')) {
      if (__DEV__) return devFallbackArticles();
      throw error;
    }
    if (__DEV__) return devFallbackArticles();
    throw new Error(apiUnreachableMessage());
  }

  const data = await parseJson<ArticlesResponse>(response);
  if (data.articles.length === 0) {
    if (__DEV__) return devFallbackArticles();
    throw new Error('No articles in the feed yet. Run "npm run api:ingest" to fetch stories from your sources.');
  }

  return { articles: withResolvedArticleFields(data.articles), meta: data.meta };
}

export async function fetchArticleById(id: string): Promise<Article | undefined> {
  try {
    const response = await fetch(`${API_URL}/api/articles/${id}`, {
      headers: { Accept: 'application/json' },
    });
    if (response.status === 404) return undefined;
    const data = await parseJson<ArticleResponse>(response);
    return data.article ? withResolvedArticleFields([data.article])[0] : undefined;
  } catch {
    return undefined;
  }
}
