export type ArticleReaderBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'image'; url: string; alt?: string; caption?: string }
  | { type: 'video'; url: string; poster?: string; provider?: string; caption?: string };

export interface ArticleReaderContent {
  title: string;
  blocks: ArticleReaderBlock[];
  readTimeMinutes: number;
  source: 'extracted' | 'feed';
}

export function paragraphTextsFromBlocks(blocks: ArticleReaderBlock[]): string[] {
  return blocks
    .filter((block): block is Extract<ArticleReaderBlock, { type: 'paragraph' }> => block.type === 'paragraph')
    .map((block) => block.text);
}
