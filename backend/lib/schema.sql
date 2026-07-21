-- DailyFold article store — Postgres (Supabase) schema.
-- Run via `npm run db:migrate` (backend/scripts/migrate.ts). Safe to re-run.

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  image_url TEXT NOT NULL,
  topics TEXT[] NOT NULL DEFAULT '{}',
  sport_tags TEXT[] NOT NULL DEFAULT '{}',
  search_tags TEXT[] NOT NULL DEFAULT '{}',
  requires_subscription BOOLEAN NOT NULL DEFAULT false,
  read_time_minutes INTEGER NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  url TEXT NOT NULL UNIQUE,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Not a GENERATED column: to_tsvector('english', ...) is STABLE, not IMMUTABLE,
  -- so Postgres rejects it in a generated expression. Maintained by trigger instead.
  search_vector tsvector
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_articles_source ON articles (source);
CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON articles USING GIN (search_vector);

CREATE OR REPLACE FUNCTION articles_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', array_to_string(NEW.search_tags, ' ')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.excerpt, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.body, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS articles_search_vector_trigger ON articles;
CREATE TRIGGER articles_search_vector_trigger
  BEFORE INSERT OR UPDATE ON articles
  FOR EACH ROW EXECUTE FUNCTION articles_search_vector_update();

CREATE TABLE IF NOT EXISTS ingest_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_reader_content (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  paragraphs JSONB NOT NULL,
  read_time_minutes INTEGER NOT NULL,
  source TEXT NOT NULL,
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
