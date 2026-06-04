import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

import { Article } from './types';

const FETCH_TIMEOUT_MS = 15_000;

const USER_AGENT =
  'Mozilla/5.0 (compatible; BeaconReader/1.0; +https://github.com/brannonglover/current)';

export interface ReaderContent {
  title: string;
  paragraphs: string[];
  readTimeMinutes: number;
  source: 'extracted' | 'feed';
}

function readTimeMinutes(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function paragraphsFromHtml(html: string): string[] {
  const { document } = parseHTML(`<article>${html}</article>`);
  const blocks = document.querySelectorAll('p, h2, h3, blockquote li');
  const paragraphs: string[] = [];

  for (const node of blocks) {
    const text = node.textContent?.replace(/\s+/g, ' ').trim();
    if (text && text.length > 20) paragraphs.push(text);
  }

  if (paragraphs.length > 0) return paragraphs;

  const plain = document.body?.textContent?.replace(/\s+/g, ' ').trim();
  if (!plain) return [];

  return plain
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
}

function feedParagraphs(article: Article): string[] {
  const fromBody = article.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (fromBody.length > 0) return fromBody;
  if (article.excerpt.trim()) return [article.excerpt.trim()];
  return [];
}

async function fetchPageHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export async function extractReaderContent(article: Article): Promise<ReaderContent> {
  const feedFallback = (): ReaderContent => {
    const paragraphs = feedParagraphs(article);
    const text = paragraphs.join('\n\n');
    return {
      title: article.title,
      paragraphs,
      readTimeMinutes: readTimeMinutes(text || article.excerpt),
      source: 'feed',
    };
  };

  try {
    const html = await fetchPageHtml(article.url);
    const { document } = parseHTML(html);
    const parsed = new Readability(document, { charThreshold: 100 }).parse();

    if (!parsed?.content) return feedFallback();

    const paragraphs = paragraphsFromHtml(parsed.content);
    if (paragraphs.length === 0) return feedFallback();

    const text = paragraphs.join('\n\n');
    return {
      title: parsed.title?.trim() || article.title,
      paragraphs,
      readTimeMinutes: readTimeMinutes(text),
      source: 'extracted',
    };
  } catch {
    return feedFallback();
  }
}
