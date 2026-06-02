import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import path from 'path';

import { inferSportTags, type SportTag } from '../../catalog/sports';

import { Article, Topic } from './types';

const dataDir = path.join(process.cwd(), 'data');
// Vercel serverless only allows writes under /tmp; data/ is read-only there.
const defaultDbPath = process.env.VERCEL
  ? path.join('/tmp', 'current.db')
  : path.join(dataDir, 'current.db');
const dbPath = process.env.DATABASE_PATH ?? defaultDbPath;

let db: Database.Database | null = null;

function getDb() {
  if (!db) {
    const dbDir = path.dirname(dbPath);
    if (dbDir !== '/tmp') {
      mkdirSync(dbDir, { recursive: true });
    }
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    migrate(db);
  }
  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      body TEXT NOT NULL,
      source TEXT NOT NULL,
      image_url TEXT NOT NULL,
      topics TEXT NOT NULL,
      read_time_minutes INTEGER NOT NULL,
      published_at TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      ingested_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);

    CREATE TABLE IF NOT EXISTS ingest_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_reader_content (
      article_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      paragraphs TEXT NOT NULL,
      read_time_minutes INTEGER NOT NULL,
      source TEXT NOT NULL,
      extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
    );
  `);

  const columns = database.prepare(`PRAGMA table_info(articles)`).all() as { name: string }[];
  if (!columns.some((column) => column.name === 'sport_tags')) {
    database.exec(`ALTER TABLE articles ADD COLUMN sport_tags TEXT NOT NULL DEFAULT '[]'`);
  }
  if (!columns.some((column) => column.name === 'requires_subscription')) {
    database.exec(
      `ALTER TABLE articles ADD COLUMN requires_subscription INTEGER NOT NULL DEFAULT 0`,
    );
  }
}

export interface CachedReaderContent {
  title: string;
  paragraphs: string[];
  readTimeMinutes: number;
  source: 'extracted' | 'feed';
}

interface ReaderContentRow {
  article_id: string;
  title: string;
  paragraphs: string;
  read_time_minutes: number;
  source: string;
}

interface ArticleRow {
  id: string;
  title: string;
  excerpt: string;
  body: string;
  source: string;
  image_url: string;
  topics: string;
  sport_tags?: string;
  requires_subscription?: number;
  read_time_minutes: number;
  published_at: string;
  url: string;
}

function rowToArticle(row: ArticleRow): Article {
  const topics = JSON.parse(row.topics) as Topic[];
  let sportTags: SportTag[] = row.sport_tags ? (JSON.parse(row.sport_tags) as SportTag[]) : [];

  if (sportTags.length === 0 && topics.includes('sports')) {
    sportTags = inferSportTags(`${row.title} ${row.excerpt}`, []);
  }

  return {
    id: row.id,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    source: row.source,
    imageUrl: row.image_url,
    topics,
    sportTags: sportTags.length > 0 ? sportTags : undefined,
    readTimeMinutes: row.read_time_minutes,
    publishedAt: row.published_at,
    url: row.url,
    requiresSubscription: row.requires_subscription === 1 ? true : undefined,
  };
}

export function upsertArticle(article: Article): 'inserted' | 'updated' {
  const database = getDb();
  const existing = database
    .prepare(`SELECT id FROM articles WHERE url = ?`)
    .get(article.url) as { id: string } | undefined;

  database
    .prepare(
      `INSERT INTO articles (
        id, title, excerpt, body, source, image_url, topics, sport_tags,
        requires_subscription, read_time_minutes, published_at, url, ingested_at
      ) VALUES (
        @id, @title, @excerpt, @body, @source, @image_url, @topics, @sport_tags,
        @requires_subscription, @read_time_minutes, @published_at, @url, datetime('now')
      )
      ON CONFLICT(url) DO UPDATE SET
        title = excluded.title,
        excerpt = excluded.excerpt,
        body = excluded.body,
        source = excluded.source,
        image_url = excluded.image_url,
        topics = excluded.topics,
        sport_tags = excluded.sport_tags,
        requires_subscription = excluded.requires_subscription,
        read_time_minutes = excluded.read_time_minutes,
        published_at = excluded.published_at,
        ingested_at = datetime('now')`,
    )
    .run({
      id: article.id,
      title: article.title,
      excerpt: article.excerpt,
      body: article.body,
      source: article.source,
      image_url: article.imageUrl,
      topics: JSON.stringify(article.topics),
      sport_tags: JSON.stringify(article.sportTags ?? []),
      requires_subscription: article.requiresSubscription ? 1 : 0,
      read_time_minutes: article.readTimeMinutes,
      published_at: article.publishedAt,
      url: article.url,
    });

  return existing ? 'updated' : 'inserted';
}

export function listArticles(options?: { limit?: number; sources?: string[] }): Article[] {
  const database = getDb();
  const limit = options?.limit ?? 200;
  const sources = options?.sources?.filter(Boolean);

  if (sources && sources.length > 0) {
    const placeholders = sources.map(() => '?').join(', ');
    const rows = database
      .prepare(
        `SELECT * FROM articles
         WHERE source IN (${placeholders})
         ORDER BY published_at DESC
         LIMIT ?`,
      )
      .all(...sources, limit) as ArticleRow[];
    return rows.map(rowToArticle);
  }

  const rows = database
    .prepare(`SELECT * FROM articles ORDER BY published_at DESC LIMIT ?`)
    .all(limit) as ArticleRow[];
  return rows.map(rowToArticle);
}

export function setArticleRequiresSubscription(id: string, requiresSubscription: boolean): void {
  const database = getDb();
  database
    .prepare(`UPDATE articles SET requires_subscription = ? WHERE id = ?`)
    .run(requiresSubscription ? 1 : 0, id);
}

export function getArticleById(id: string): Article | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM articles WHERE id = ?`)
    .get(id) as ArticleRow | undefined;
  return row ? rowToArticle(row) : undefined;
}

export function articleCount(): number {
  const database = getDb();
  const row = database.prepare(`SELECT COUNT(*) as count FROM articles`).get() as {
    count: number;
  };
  return row.count;
}

export function getLastIngestAt(): Date | null {
  const database = getDb();
  const row = database
    .prepare(`SELECT value FROM ingest_meta WHERE key = 'last_ingest_at'`)
    .get() as { value: string } | undefined;
  return row ? new Date(row.value) : null;
}

export function setLastIngestAt(iso: string) {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO ingest_meta (key, value) VALUES ('last_ingest_at', @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run({ value: iso });
}

export function pruneOldArticles(maxAgeDays: number): number {
  if (maxAgeDays <= 0) return 0;
  const database = getDb();
  const result = database
    .prepare(
      `DELETE FROM articles
       WHERE published_at < datetime('now', '-' || @days || ' days')`,
    )
    .run({ days: maxAgeDays });
  return result.changes;
}

export function getIngestStatus() {
  return {
    articleCount: articleCount(),
    lastIngestAt: getLastIngestAt()?.toISOString() ?? null,
  };
}

export function getCachedReaderContent(articleId: string): CachedReaderContent | undefined {
  const database = getDb();
  const row = database
    .prepare(`SELECT * FROM article_reader_content WHERE article_id = ?`)
    .get(articleId) as ReaderContentRow | undefined;

  if (!row) return undefined;

  return {
    title: row.title,
    paragraphs: JSON.parse(row.paragraphs) as string[],
    readTimeMinutes: row.read_time_minutes,
    source: row.source as CachedReaderContent['source'],
  };
}

export function saveReaderContent(articleId: string, content: CachedReaderContent): void {
  const database = getDb();
  database
    .prepare(
      `INSERT INTO article_reader_content (
        article_id, title, paragraphs, read_time_minutes, source, extracted_at
      ) VALUES (
        @article_id, @title, @paragraphs, @read_time_minutes, @source, datetime('now')
      )
      ON CONFLICT(article_id) DO UPDATE SET
        title = excluded.title,
        paragraphs = excluded.paragraphs,
        read_time_minutes = excluded.read_time_minutes,
        source = excluded.source,
        extracted_at = datetime('now')`,
    )
    .run({
      article_id: articleId,
      title: content.title,
      paragraphs: JSON.stringify(content.paragraphs),
      read_time_minutes: content.readTimeMinutes,
      source: content.source,
    });
}
