import { resolveClickedArticles } from '@/services/clickedArticles';
import { resolveLikedArticles } from '@/services/likedArticles';
import { articleSportTags } from '@/services/sportPreferences';
import {
  extractInterestKeywords,
  getInterestKeywordWeight,
  isSourceBleed,
} from '@/utils/interestKeywords';
import { Article, Topic, UserPreferences } from '@/types';

export const LIKE_BOOST = 1;
/** Weaker curiosity signal from opening a feed article without liking it. */
export const CLICK_BOOST = 0.5;

/** Interest profile derived from saved likes — source of truth for For You matching. */
export type LikedInterestProfile = Pick<
  UserPreferences,
  'topicScores' | 'keywordScores' | 'sportTagScores'
>;

function adjustScoreMap(
  scores: Record<string, number>,
  keys: string[],
  delta: number,
): Record<string, number> {
  const next = { ...scores };
  for (const key of keys) {
    const current = next[key] ?? 0;
    const updated = current + delta;
    if (updated <= 0) {
      delete next[key];
    } else {
      next[key] = updated;
    }
  }
  return next;
}

export function articleInterestKeywords(article: Article): string[] {
  return extractInterestKeywords({
    text: `${article.title} ${article.excerpt}`,
    title: article.title,
    source: article.source,
    topics: article.topics,
  });
}

function applyWeightedKeywordScores(
  scores: Record<string, number>,
  keywords: string[],
  delta: number,
): Record<string, number> {
  const next = { ...scores };
  for (const keyword of keywords) {
    const weight = getInterestKeywordWeight(keyword);
    const current = next[keyword] ?? 0;
    const updated = current + delta * weight;
    if (updated <= 0) {
      delete next[keyword];
    } else {
      next[keyword] = updated;
    }
  }
  return next;
}

export function applyArticleLikeSignals(
  preferences: UserPreferences,
  article: Article,
  currentlyLiked: boolean,
): Pick<UserPreferences, 'topicScores' | 'keywordScores' | 'sportTagScores'> {
  const delta = currentlyLiked ? -LIKE_BOOST : LIKE_BOOST;

  const topicScores = { ...preferences.topicScores };
  for (const topic of article.topics) {
    if (isSourceBleed(topic, article.source)) continue;
    const current = topicScores[topic as Topic] ?? 0;
    const updated = current + delta;
    topicScores[topic as Topic] = Math.max(0, updated);
  }

  const keywordScores = applyWeightedKeywordScores(
    preferences.keywordScores,
    articleInterestKeywords(article),
    delta,
  );

  const sportTagScores = adjustScoreMap(
    preferences.sportTagScores ?? {},
    articleSportTags(article),
    delta,
  );

  return { topicScores, keywordScores, sportTagScores };
}

export function applyArticleClickSignals(
  preferences: UserPreferences,
  article: Article,
): Pick<UserPreferences, 'topicScores' | 'keywordScores' | 'sportTagScores'> {
  const delta = CLICK_BOOST;

  const topicScores = { ...preferences.topicScores };
  for (const topic of article.topics) {
    if (isSourceBleed(topic, article.source)) continue;
    const current = topicScores[topic as Topic] ?? 0;
    const updated = current + delta;
    topicScores[topic as Topic] = Math.max(0, updated);
  }

  const keywordScores = applyWeightedKeywordScores(
    preferences.keywordScores,
    articleInterestKeywords(article),
    delta,
  );

  const sportTagScores = adjustScoreMap(
    preferences.sportTagScores ?? {},
    articleSportTags(article),
    delta,
  );

  return { topicScores, keywordScores, sportTagScores };
}

export function hasInterestSignals(profile: {
  topicScores: Record<string, number>;
  keywordScores: Record<string, number>;
  sportTagScores?: Record<string, number>;
}): boolean {
  if (Object.values(profile.topicScores).some((score) => score > 0)) return true;
  if (Object.values(profile.keywordScores).some((score) => score > 0)) return true;
  if (Object.values(profile.sportTagScores ?? {}).some((score) => score > 0)) return true;
  return false;
}

export function hasPersonalizationSignals(
  prefs: UserPreferences | null | undefined,
): boolean {
  if (!prefs) return false;
  return prefs.likedArticleIds.length > 0 || (prefs.clickedArticleIds?.length ?? 0) > 0;
}

function mergeScoreMaps(
  primary: Record<string, number>,
  secondary: Record<string, number>,
): Record<string, number> {
  const next = { ...secondary };
  for (const [key, score] of Object.entries(primary)) {
    if (score <= 0) continue;
    next[key] = Math.max(next[key] ?? 0, score);
  }
  return next;
}

function persistedInterestProfile(
  prefs: UserPreferences,
): LikedInterestProfile {
  return {
    topicScores: prefs.topicScores,
    keywordScores: prefs.keywordScores,
    sportTagScores: prefs.sportTagScores ?? {},
  };
}

function interestProfilesEqual(a: LikedInterestProfile, b: LikedInterestProfile): boolean {
  const mapsEqual = (left: Record<string, number>, right: Record<string, number>) => {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of keys) {
      if ((left[key] ?? 0) !== (right[key] ?? 0)) return false;
    }
    return true;
  };

  return (
    mapsEqual(a.topicScores, b.topicScores) &&
    mapsEqual(a.keywordScores, b.keywordScores) &&
    mapsEqual(a.sportTagScores ?? {}, b.sportTagScores ?? {})
  );
}

export function mergeInterestProfiles(
  fromLikes: LikedInterestProfile,
  persisted: LikedInterestProfile,
): LikedInterestProfile {
  return {
    topicScores: mergeScoreMaps(
      fromLikes.topicScores,
      persisted.topicScores,
    ) as UserPreferences['topicScores'],
    keywordScores: mergeScoreMaps(fromLikes.keywordScores, persisted.keywordScores),
    sportTagScores: mergeScoreMaps(
      fromLikes.sportTagScores ?? {},
      persisted.sportTagScores ?? {},
    ),
  };
}

function profileFromLikedArticles(liked: Article[]): LikedInterestProfile {
  const topicScores = {} as UserPreferences['topicScores'];
  const keywordScores: Record<string, number> = {};
  const sportTagScores: Record<string, number> = {};

  for (const article of liked) {
    for (const topic of article.topics) {
      if (isSourceBleed(topic, article.source)) continue;
      topicScores[topic as Topic] = (topicScores[topic as Topic] ?? 0) + 1;
    }
    for (const keyword of articleInterestKeywords(article)) {
      const weight = getInterestKeywordWeight(keyword);
      keywordScores[keyword] = (keywordScores[keyword] ?? 0) + weight;
    }
    for (const tag of articleSportTags(article)) {
      sportTagScores[tag] = (sportTagScores[tag] ?? 0) + 1;
    }
  }

  return { topicScores, keywordScores, sportTagScores };
}

function scaleProfile(profile: LikedInterestProfile, factor: number): LikedInterestProfile {
  const scaleMap = (scores: Record<string, number>) => {
    const next: Record<string, number> = {};
    for (const [key, score] of Object.entries(scores)) {
      if (score <= 0) continue;
      next[key] = score * factor;
    }
    return next;
  };

  return {
    topicScores: scaleMap(profile.topicScores) as UserPreferences['topicScores'],
    keywordScores: scaleMap(profile.keywordScores),
    sportTagScores: scaleMap(profile.sportTagScores ?? {}),
  };
}

function addProfiles(
  left: LikedInterestProfile,
  right: LikedInterestProfile,
): LikedInterestProfile {
  const addMaps = (a: Record<string, number>, b: Record<string, number>) => {
    const next = { ...a };
    for (const [key, score] of Object.entries(b)) {
      if (score <= 0) continue;
      next[key] = (next[key] ?? 0) + score;
    }
    return next;
  };

  return {
    topicScores: addMaps(left.topicScores, right.topicScores) as UserPreferences['topicScores'],
    keywordScores: addMaps(left.keywordScores, right.keywordScores),
    sportTagScores: addMaps(left.sportTagScores ?? {}, right.sportTagScores ?? {}),
  };
}

/** Build a fresh interest profile from liked article content on each feed load. */
export function buildLikedInterestProfile(
  prefs: UserPreferences,
  feedArticles: Article[] = [],
): LikedInterestProfile | null {
  const persisted = persistedInterestProfile(prefs);
  const liked = resolveLikedArticles(
    prefs.likedArticleIds,
    prefs.likedArticles ?? {},
    feedArticles,
  );

  if (liked.length === 0) {
    if (prefs.likedArticleIds.length === 0) return null;
    return hasInterestSignals(persisted) ? persisted : null;
  }

  return profileFromLikedArticles(liked);
}

/** Build For You interest profile from explicit likes and feed click curiosity. */
export function buildInterestProfile(
  prefs: UserPreferences,
  feedArticles: Article[] = [],
): LikedInterestProfile | null {
  const liked = resolveLikedArticles(
    prefs.likedArticleIds,
    prefs.likedArticles ?? {},
    feedArticles,
  );
  const clicked = resolveClickedArticles(
    prefs.clickedArticleIds ?? [],
    prefs.clickedArticles ?? {},
    feedArticles,
  ).filter((article) => !prefs.likedArticleIds.includes(article.id));

  const parts: LikedInterestProfile[] = [];

  if (liked.length > 0) {
    parts.push(profileFromLikedArticles(liked));
  }

  if (clicked.length > 0) {
    parts.push(scaleProfile(profileFromLikedArticles(clicked), CLICK_BOOST));
  }

  if (parts.length > 0) {
    const merged = parts.reduce(addProfiles);
    return hasInterestSignals(merged) ? merged : null;
  }

  if (prefs.likedArticleIds.length > 0 || (prefs.clickedArticleIds?.length ?? 0) > 0) {
    const persisted = persistedInterestProfile(prefs);
    return hasInterestSignals(persisted) ? persisted : null;
  }

  return null;
}

/** Sync persisted interest scores from saved like/click snapshots on load. */
export function reconcileInterestScores(prefs: UserPreferences): UserPreferences {
  if (prefs.likedArticleIds.length === 0 && (prefs.clickedArticleIds?.length ?? 0) === 0) {
    return prefs;
  }

  const profile = buildInterestProfile(prefs, [
    ...Object.values(prefs.likedArticles ?? {}),
    ...Object.values(prefs.clickedArticles ?? {}),
  ]);
  if (!profile || !hasInterestSignals(profile)) return prefs;
  if (interestProfilesEqual(profile, persistedInterestProfile(prefs))) return prefs;

  return {
    ...prefs,
    topicScores: profile.topicScores,
    keywordScores: profile.keywordScores,
    sportTagScores: profile.sportTagScores,
  };
}
