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
-- Chip/source feeds filter with `sport_tags && '{…}'`; GIN is the only index type that
-- can answer array overlap.
CREATE INDEX IF NOT EXISTS idx_articles_sport_tags ON articles USING GIN (sport_tags);
CREATE INDEX IF NOT EXISTS idx_articles_topics ON articles USING GIN (topics);
-- Candidate pool for the personalized feed: recent rows that have a usable hero.
-- Feed cards without an image are dropped client-side anyway (~13% of recent rows),
-- so excluding them from the index keeps them out of the scan and off the wire.
CREATE INDEX IF NOT EXISTS idx_articles_recent_with_hero
  ON articles (published_at DESC, id DESC)
  WHERE image_url <> '';

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

-- One row per registered device (Expo push token), not per user — a user can have
-- multiple installs. Preference columns mirror the subset of client UserPreferences
-- that server-side notification scoring actually consumes (see backend/lib/notify/).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  expo_push_token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  topic_scores JSONB NOT NULL DEFAULT '{}',
  keyword_scores JSONB NOT NULL DEFAULT '{}',
  sport_tag_scores JSONB NOT NULL DEFAULT '{}',
  enabled_topics TEXT[] NOT NULL DEFAULT '{}',
  for_you_topics TEXT[] NOT NULL DEFAULT '{}',
  for_you_keywords TEXT[] NOT NULL DEFAULT '{}',
  for_you_sport_tags TEXT[] NOT NULL DEFAULT '{}',
  enabled_source_ids TEXT[] NOT NULL DEFAULT '{}',
  enabled_sport_tags TEXT[] NOT NULL DEFAULT '{}',
  blocked_topics TEXT[] NOT NULL DEFAULT '{}',
  blocked_sport_tags TEXT[] NOT NULL DEFAULT '{}',
  blocked_keywords TEXT[] NOT NULL DEFAULT '{}',
  trending_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  notified_article_ids TEXT[] NOT NULL DEFAULT '{}',
  last_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Explicit For You interests, added after the table shipped. CREATE TABLE IF NOT EXISTS
-- above is a no-op on an existing database, so existing deployments need these ALTERs.
-- Additive, idempotent and backward-compatible: rows written before this migration keep
-- working and read back as empty arrays via the NOT NULL DEFAULT '{}'.
ALTER TABLE push_subscriptions
  ADD COLUMN IF NOT EXISTS for_you_topics TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS for_you_keywords TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS for_you_sport_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_enabled
  ON push_subscriptions (trending_notifications_enabled)
  WHERE trending_notifications_enabled = true;

-- Scratch table for polling Expo push receipts (delivery status) a few minutes
-- after sending; rows are deleted once a receipt is processed.
CREATE TABLE IF NOT EXISTS push_receipts (
  ticket_id TEXT PRIMARY KEY,
  expo_push_token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Direct-file (MP4/WebM/MOV) videos found inside articles, for the app's Videos tab.
-- Populated by lib/videoIndex.ts after ingest; one playable video per article.
-- published_at is denormalized from articles so the feed pages off this index alone.
CREATE TABLE IF NOT EXISTS article_videos (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  video_url TEXT NOT NULL,
  poster_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_article_videos_published_at
  ON article_videos (published_at DESC, article_id DESC);
-- Publishers (ESPN especially) reuse one clip across several stories; show each clip once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_videos_video_url ON article_videos (video_url);

-- Articles whose page has been checked for video (hit or miss), so each page is fetched once.
CREATE TABLE IF NOT EXISTS article_video_scans (
  article_id TEXT PRIMARY KEY REFERENCES articles(id) ON DELETE CASCADE,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- YouTube Shorts from the curated channels in lib/videoChannels.ts, for the Videos tab.
-- Populated by lib/youtubeShorts.ts from each channel's Shorts RSS feed. embeddable=false
-- rows are kept so a video the owner blocked from embedding isn't re-checked every run.
CREATE TABLE IF NOT EXISTS youtube_shorts (
  video_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  channel_name TEXT NOT NULL,
  topic TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  embeddable BOOLEAN NOT NULL,
  published_at TIMESTAMPTZ NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_youtube_shorts_published_at
  ON youtube_shorts (published_at DESC, video_id DESC);
CREATE INDEX IF NOT EXISTS idx_youtube_shorts_channel
  ON youtube_shorts (channel_id, published_at DESC);
