import { API_URL } from '@/constants/api';
import { ArticleReaderBlock, ArticleReaderContent } from '@/types/articleContent';

interface ContentResponse {
  content: ArticleReaderContent & { paragraphs?: string[] };
}

function normalizeReaderContent(
  content: ContentResponse['content'],
): ArticleReaderContent {
  if (content.blocks?.length) {
    return {
      title: content.title,
      blocks: content.blocks,
      readTimeMinutes: content.readTimeMinutes,
      source: content.source,
    };
  }

  const legacyParagraphs = content.paragraphs ?? [];
  const blocks: ArticleReaderBlock[] = legacyParagraphs.map((text) => ({
    type: 'paragraph',
    text,
  }));

  return {
    title: content.title,
    blocks,
    readTimeMinutes: content.readTimeMinutes,
    source: content.source,
  };
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`API error: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchArticleReaderContent(
  articleId: string,
): Promise<ArticleReaderContent> {
  const response = await fetch(`${API_URL}/api/articles/${articleId}/content`, {
    headers: { Accept: 'application/json' },
  });
  const data = await parseJson<ContentResponse>(response);
  return normalizeReaderContent(data.content);
}
