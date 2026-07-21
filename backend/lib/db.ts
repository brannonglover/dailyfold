import {
  generateArticleSearchTags,
  expandSearchQueryTerms,
} from '../../catalog/articleSearch';
import { inferSportTags, type SportTag } from '../../catalog/sports';
import { repairBrokenGuardianImageUrl } from '../../catalog/guardianImageUrl';

import { getSql, resetSqlConnectionForTests } from './postgres';
import type { ReaderBlock } from './extract';
import { articleNeedsHeroEnrichment } from './ogImage';

import { Article, Topic } from './types';

/** @internal closes the pooled connection so tests can re-init cleanly */
export async function resetDbConnectionForTests(): Promise<void> {
  await resetSqlConnectionForTests();
}

export interface CachedReaderContent {
  title: string;
  blocks: ReaderBlock[];
  readTimeMinutes: number;
  source: 'extracted' | 'feed';
  /** True when cache predates inline-image block extraction (paragraph strings only). */
  legacyTextOnlyFormat?: boolean;
}

function parseStoredReaderBlocks(paragraphs: unknown): {
  blocks: ReaderBlock[];
  legacyTextOnlyFormat: boolean;
} {
  if (!Array.isArray(paragraphs) || paragraphs.length === 0) {
    return { blocks: [], legacyTextOnlyFormat: false };
  }

  if (typeof paragraphs[0] === 'string') {
    return {
      blocks: paragraphs.map((text) => ({ type: 'paragraph' as const, text: text as string })),
      legacyTextOnlyFormat: true,
    };
  }

  return { blocks: paragraphs as ReaderBlock[], legacyTextOnlyFormat: false };
}

interface ArticleRow {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  source: string;
  image_url: string;
  topics: string[];
  sport_tags: string[];
  search_tags: string[];
  requires_subscription: boolean;
  read_time_minutes: number;
  published_at: Date;
  url: string;
}

function rowToArticle(row: ArticleRow): Article {
  const topics = row.topics as Topic[];
  const storedTags: SportTag[] = (row.sport_tags ?? []) as SportTag[];
  let sportTags: SportTag[] = storedTags;

  if (topics.includes('sports')) {
    sportTags = inferSportTags(`${row.title} ${row.excerpt}`, storedTags);
  }

  const searchTags = row.search_tags ?? [];

  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    source: row.source,
    imageUrl: repairBrokenGuardianImageUrl(row.image_url),
    topics,
    sportTags: sportTags.length > 0 ? sportTags : undefined,
    searchTags: searchTags.length > 0 ? searchTags : undefined,
    readTimeMinutes: row.read_time_minutes,
    publishedAt: row.published_at.toISOString(),
    url: row.url,
    requiresSubscription: row.requires_subscription === true ? true : undefined,
  };
}

function resolveArticleSearchTags(article: Article): string[] {
  if (article.searchTags && article.searchTags.length > 0) {
    return [...article.searchTags];
  }
  return generateArticleSearchTags({
    title: article.title,
    excerpt: article.excerpt,
    body: article.body,
    topics: article.topics,
    sportTags: article.sportTags,
  });
}

interface UpsertEntry {
  article: Article;
  feedPublishedAt?: string;
}

const UPSERT_CHUNK_SIZE = 500;

/** Bulk upsert-by-url. Batches in chunks to keep each round trip reasonable. */
export async function upsertArticles(
  entries: UpsertEntry[],
): Promise<{ inserted: number; updated: number }> {
  if (entries.length === 0) return { inserted: 0, updated: 0 };

  const sql = getSql();
  let inserted = 0;
  let updated = 0;

  // jsonb_to_recordset (not UNNEST) — UNNEST fully flattens nested arrays, which would
  // scatter each article's topics/tags across rows instead of keeping one array per row.
  // Raw SQL string + $1 placeholder (via sql.unsafe) since the AS t(...) column-type list
  // can't be expressed as a bound parameter in a tagged-template query.
  const RECORD_COLUMNS = `(
    id text, title text, excerpt text, body text, source text, image_url text,
    topics text[], sport_tags text[], search_tags text[],
    requires_subscription boolean, read_time_minutes integer,
    feed_published_at timestamptz, url text
  )`;

  const insertSql = `
    INSERT INTO articles (
      id, title, excerpt, body, source, image_url, topics, sport_tags, search_tags,
      requires_subscription, read_time_minutes, published_at, url, ingested_at
    )
    SELECT
      t.id, t.title, t.excerpt, t.body, t.source, t.image_url, t.topics, t.sport_tags, t.search_tags,
      t.requires_subscription, t.read_time_minutes,
      COALESCE(t.feed_published_at, now()),
      t.url, now()
    FROM jsonb_to_recordset($1::jsonb) AS t${RECORD_COLUMNS}
    ON CONFLICT (url) DO NOTHING
    RETURNING id
  `;

  const updateSql = `
    UPDATE articles a SET
      title = t.title,
      excerpt = t.excerpt,
      body = t.body,
      source = t.source,
      image_url = t.image_url,
      topics = t.topics,
      sport_tags = t.sport_tags,
      search_tags = t.search_tags,
      requires_subscription = t.requires_subscription,
      read_time_minutes = t.read_time_minutes,
      published_at = COALESCE(t.feed_published_at, a.published_at),
      ingested_at = now()
    FROM jsonb_to_recordset($1::jsonb) AS t${RECORD_COLUMNS}
    WHERE a.url = t.url
  `;

  for (let offset = 0; offset < entries.length; offset += UPSERT_CHUNK_SIZE) {
    const chunk = entries.slice(offset, offset + UPSERT_CHUNK_SIZE);

    const rows = chunk.map((e) => ({
      id: e.article.id,
      title: e.article.title,
      excerpt: e.article.excerpt,
      body: e.article.body,
      source: e.article.source,
      image_url: e.article.imageUrl,
      topics: e.article.topics,
      sport_tags: e.article.sportTags ?? [],
      search_tags: resolveArticleSearchTags(e.article),
      requires_subscription: e.article.requiresSubscription === true,
      read_time_minutes: e.article.readTimeMinutes,
      feed_published_at: e.feedPublishedAt ?? null,
      url: e.article.url,
    }));
    // Fresh rows only — conflicts fall through untouched here, resolved by the update pass below.
    const insertedRows = await sql.unsafe<{ id: string }[]>(insertSql, [rows]);

    // Existing rows (including the ones just inserted above, harmlessly re-applied).
    await sql.unsafe(updateSql, [rows]);

    inserted += insertedRows.length;
    updated += chunk.length - insertedRows.length;
  }

  return { inserted, updated };
}

export async function upsertArticle(
  article: Article,
  options?: { feedPublishedAt?: string },
): Promise<'inserted' | 'updated'> {
  const { inserted } = await upsertArticles([
    { article, feedPublishedAt: options?.feedPublishedAt },
  ]);
  return inserted > 0 ? 'inserted' : 'updated';
}

export interface ListArticlesOptions {
  limit?: number;
  sources?: string[];
  /** Opaque cursor from a prior page (`publishedAt|id`). */
  cursor?: string;
}

export interface ListArticlesResult {
  articles: Article[];
  hasMore: boolean;
  nextCursor: string | null;
}

export function encodeArticleCursor(publishedAt: string, id: string): string {
  return `${publishedAt}|${id}`;
}

function decodeArticleCursor(cursor: string): { publishedAt: string; id: string } | null {
  const separator = cursor.indexOf('|');
  if (separator <= 0) return null;
  const publishedAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  if (!publishedAt || !id) return null;
  return { publishedAt, id };
}

export interface SearchArticlesOptions {
  limit?: number;
}

function tsLexeme(word: string): string {
  return word.replace(/[&|!():'*<>\\]/g, ' ').trim();
}

/** Build a `to_tsquery`-compatible string: OR across expanded terms, prefix match on the last word of each. */
function buildPgTsQueryText(query: string): string | null {
  const terms = expandSearchQueryTerms(query);
  if (terms.length === 0) return null;

  const clauses = terms
    .map((term) => {
      const words = term.split(/\s+/).map(tsLexeme).filter(Boolean);
      if (words.length === 0) return null;
      return words.map((w, i) => (i === words.length - 1 ? `${w}:*` : w)).join(' <-> ');
    })
    .filter((clause): clause is string => !!clause);

  return clauses.length > 0 ? clauses.join(' | ') : null;
}

export async function searchArticles(query: string, options?: SearchArticlesOptions): Promise<Article[]> {
  const tsQueryText = buildPgTsQueryText(query);
  if (!tsQueryText) return [];

  const limit = Math.min(Math.max(1, options?.limit ?? 25), 50);
  const sql = getSql();

  const rows = await sql<ArticleRow[]>`
    SELECT * FROM articles
    WHERE search_vector @@ to_tsquery('english', ${tsQueryText})
    ORDER BY ts_rank_cd(search_vector, to_tsquery('english', ${tsQueryText})) DESC, published_at DESC
    LIMIT ${limit}
  `;

  return rows.map(rowToArticle);
}

export async function listArticles(options?: ListArticlesOptions): Promise<ListArticlesResult> {
  const sql = getSql();
  const limit = Math.min(Math.max(1, options?.limit ?? 200), 100);
  const sources = options?.sources?.filter(Boolean);
  const decoded = options?.cursor ? decodeArticleCursor(options.cursor) : null;
  const fetchLimit = limit + 1;

  let rows: ArticleRow[];

  if (sources && sources.length > 0) {
    rows = decoded
      ? await sql<ArticleRow[]>`
          SELECT * FROM articles
          WHERE source = ANY(${sources}::text[])
            AND (published_at, id) < (${decoded.publishedAt}::timestamptz, ${decoded.id})
          ORDER BY published_at DESC, id DESC
          LIMIT ${fetchLimit}
        `
      : await sql<ArticleRow[]>`
          SELECT * FROM articles
          WHERE source = ANY(${sources}::text[])
          ORDER BY published_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
  } else {
    rows = decoded
      ? await sql<ArticleRow[]>`
          SELECT * FROM articles
          WHERE (published_at, id) < (${decoded.publishedAt}::timestamptz, ${decoded.id})
          ORDER BY published_at DESC, id DESC
          LIMIT ${fetchLimit}
        `
      : await sql<ArticleRow[]>`
          SELECT * FROM articles
          ORDER BY published_at DESC, id DESC
          LIMIT ${fetchLimit}
        `;
  }

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const articles = pageRows.map(rowToArticle);
  const last = pageRows[pageRows.length - 1];
  const nextCursor =
    hasMore && last ? encodeArticleCursor(last.published_at.toISOString(), last.id) : null;

  return { articles, hasMore, nextCursor };
}

export async function setArticleRequiresSubscription(
  id: string,
  requiresSubscription: boolean,
): Promise<void> {
  const sql = getSql();
  await sql`UPDATE articles SET requires_subscription = ${requiresSubscription} WHERE id = ${id}`;
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  const sql = getSql();
  const rows = await sql<ArticleRow[]>`SELECT * FROM articles WHERE id = ${id}`;
  return rows[0] ? rowToArticle(rows[0]) : undefined;
}

/** Guardian rows missing a usable hero (empty, placeholder, broken, or tiny signed CDN URL). */
export async function listGuardianArticlesNeedingHeroRepair(): Promise<
  { id: string; url: string; imageUrl: string }[]
> {
  const sql = getSql();
  const rows = await sql<{ id: string; url: string; image_url: string }[]>`
    SELECT id, url, image_url FROM articles WHERE source LIKE 'The Guardian%'
  `;

  return rows
    .filter((row) => articleNeedsHeroEnrichment(row.image_url))
    .map((row) => ({ id: row.id, url: row.url, imageUrl: row.image_url }));
}

/** Backfill hero image when ingest missed RSS/OG enrichment (e.g. legacy Guardian rows). */
export async function updateArticleImageUrl(id: string, imageUrl: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE articles SET image_url = ${imageUrl} WHERE id = ${id}`;
}

export async function articleCount(): Promise<number> {
  const sql = getSql();
  const rows = await sql<{ count: number }[]>`SELECT COUNT(*)::int AS count FROM articles`;
  return rows[0]?.count ?? 0;
}

export async function getLastIngestAt(): Promise<Date | null> {
  const sql = getSql();
  const rows = await sql<{ value: string }[]>`
    SELECT value FROM ingest_meta WHERE key = 'last_ingest_at'
  `;
  return rows[0] ? new Date(rows[0].value) : null;
}

export async function setLastIngestAt(iso: string): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO ingest_meta (key, value) VALUES ('last_ingest_at', ${iso})
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `;
}

export async function pruneOldArticles(maxAgeDays: number): Promise<number> {
  if (maxAgeDays <= 0) return 0;
  const sql = getSql();
  const result = await sql`
    DELETE FROM articles WHERE published_at < now() - (${maxAgeDays}::text || ' days')::interval
  `;
  return result.count ?? 0;
}

export async function getIngestStatus() {
  const [count, lastIngestAt] = await Promise.all([articleCount(), getLastIngestAt()]);
  return {
    articleCount: count,
    lastIngestAt: lastIngestAt?.toISOString() ?? null,
  };
}

interface ReaderContentRow {
  article_id: string;
  title: string;
  paragraphs: unknown;
  read_time_minutes: number;
  source: string;
}

export async function getCachedReaderContent(
  articleId: string,
): Promise<CachedReaderContent | undefined> {
  const sql = getSql();
  const rows = await sql<ReaderContentRow[]>`
    SELECT * FROM article_reader_content WHERE article_id = ${articleId}
  `;
  const row = rows[0];
  if (!row) return undefined;

  const { blocks, legacyTextOnlyFormat } = parseStoredReaderBlocks(row.paragraphs);

  return {
    title: row.title,
    blocks,
    readTimeMinutes: row.read_time_minutes,
    source: row.source as CachedReaderContent['source'],
    legacyTextOnlyFormat,
  };
}

export async function saveReaderContent(
  articleId: string,
  content: CachedReaderContent,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO article_reader_content (
      article_id, title, paragraphs, read_time_minutes, source, extracted_at
    ) VALUES (
      ${articleId}, ${content.title}, ${sql.json(content.blocks)}, ${content.readTimeMinutes},
      ${content.source}, now()
    )
    ON CONFLICT (article_id) DO UPDATE SET
      title = excluded.title,
      paragraphs = excluded.paragraphs,
      read_time_minutes = excluded.read_time_minutes,
      source = excluded.source,
      extracted_at = now()
  `;
}
