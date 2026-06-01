import { resolveSourceLogoUrl } from '@/catalog/logoUrl';
import { SOURCE_CATALOG } from '@/catalog/sources';

const logoBySourceName = new Map(
  SOURCE_CATALOG.map((entry) => [entry.name, resolveSourceLogoUrl(entry)]),
);

export function resolveSourceLogoByName(sourceName: string): string | undefined {
  return logoBySourceName.get(sourceName);
}

export function resolveArticleSourceLogo(article: {
  source: string;
  sourceLogo?: string;
}): string | undefined {
  return article.sourceLogo ?? resolveSourceLogoByName(article.source);
}
