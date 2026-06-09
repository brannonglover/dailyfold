import { SPORT_TAG_ORDER } from '@/catalog/sports';
import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { articleInterestKeywords } from '@/services/interestSignals';
import { articleSportTags } from '@/services/sportPreferences';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { Article, FeedSource, SportTag, Topic, UserPreferences } from '@/types';

const MAX_BLOCKED_KEYWORDS = 40;

function uniqueTopics(topics: Topic[]): Topic[] {
  const seen = new Set<Topic>();
  const out: Topic[] = [];
  for (const topic of topics) {
    if (seen.has(topic)) continue;
    seen.add(topic);
    out.push(topic);
  }
  return out;
}

function uniqueSportTags(tags: SportTag[]): SportTag[] {
  const seen = new Set<SportTag>();
  const out: SportTag[] = [];
  for (const tag of tags) {
    if (seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const keyword of keywords) {
    const normalized = keyword.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

export function findSourceIdForArticle(article: Article, sources: FeedSource[]): string | null {
  const match = sources.find((source) => source.name === article.source);
  return match?.id ?? null;
}

/** Disable an outlet in the existing enabled-source whitelist model. */
export function disableSourceInPreferences(
  prefs: UserPreferences,
  sources: FeedSource[],
  sourceId: string,
): UserPreferences | null {
  const allIds = sources.map((source) => source.id);
  if (!allIds.includes(sourceId)) return null;

  let nextIds: string[];

  if (isAllSourcesEnabled(prefs.enabledSourceIds)) {
    nextIds = allIds.filter((id) => id !== sourceId);
  } else if (prefs.enabledSourceIds.includes(sourceId)) {
    nextIds = prefs.enabledSourceIds.filter((id) => id !== sourceId);
  } else {
    return null;
  }

  if (nextIds.length === 0) return null;

  return { ...prefs, enabledSourceIds: nextIds };
}

export function addBlockedTopic(prefs: UserPreferences, topic: Topic): UserPreferences {
  if (prefs.blockedTopics.includes(topic)) return prefs;
  return {
    ...prefs,
    blockedTopics: uniqueTopics([...prefs.blockedTopics, topic]),
  };
}

export function addBlockedSportTag(prefs: UserPreferences, tag: SportTag): UserPreferences {
  if (prefs.blockedSportTags.includes(tag)) return prefs;
  return {
    ...prefs,
    blockedSportTags: uniqueSportTags([...prefs.blockedSportTags, tag]),
  };
}

export function addBlockedKeywordsFromArticle(
  prefs: UserPreferences,
  article: Article,
  limit = 5,
): UserPreferences {
  const incoming = articleInterestKeywords(article).slice(0, limit);
  if (incoming.length === 0) return prefs;

  const merged = uniqueKeywords([...prefs.blockedKeywords, ...incoming]).slice(0, MAX_BLOCKED_KEYWORDS);
  if (merged.length === prefs.blockedKeywords.length) return prefs;

  return { ...prefs, blockedKeywords: merged };
}

export function filterArticlesByBlocks(
  articles: Article[],
  prefs: UserPreferences | null | undefined,
): Article[] {
  if (!prefs) return articles;

  const blockedTopics = new Set(prefs.blockedTopics);
  const blockedSportTags = new Set(prefs.blockedSportTags);
  const blockedKeywords = new Set(prefs.blockedKeywords);

  if (blockedTopics.size === 0 && blockedSportTags.size === 0 && blockedKeywords.size === 0) {
    return articles;
  }

  return articles.filter((article) => {
    if (blockedTopics.size > 0 && article.topics.some((topic) => blockedTopics.has(topic))) {
      return false;
    }

    if (blockedSportTags.size > 0 && article.topics.includes('sports')) {
      const tags = articleSportTags(article);
      if (tags.some((tag) => blockedSportTags.has(tag))) return false;
    }

    if (blockedKeywords.size > 0) {
      const keywords = articleInterestKeywords(article);
      if (keywords.some((keyword) => blockedKeywords.has(keyword))) return false;
    }

    return true;
  });
}

/** Sanitize persisted block lists. */
export function normalizeBlockPreferences(prefs: UserPreferences): UserPreferences {
  const validTopics = new Set<Topic>(CURIOSITY_ORDER);
  const validSportTags = new Set<SportTag>(SPORT_TAG_ORDER);

  const blockedTopics = uniqueTopics(
    (prefs.blockedTopics ?? []).filter((topic): topic is Topic => validTopics.has(topic)),
  );
  const blockedSportTags = uniqueSportTags(
    (prefs.blockedSportTags ?? []).filter((tag): tag is SportTag => validSportTags.has(tag)),
  );
  const blockedKeywords = uniqueKeywords(prefs.blockedKeywords ?? []).slice(0, MAX_BLOCKED_KEYWORDS);

  if (
    blockedTopics.length === (prefs.blockedTopics?.length ?? 0) &&
    blockedSportTags.length === (prefs.blockedSportTags?.length ?? 0) &&
    blockedKeywords.length === (prefs.blockedKeywords?.length ?? 0) &&
    prefs.blockedTopics &&
    prefs.blockedSportTags &&
    prefs.blockedKeywords
  ) {
    return prefs;
  }

  return { ...prefs, blockedTopics, blockedSportTags, blockedKeywords };
}
