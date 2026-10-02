import { SOCCER_LEAGUE_TAGS, SportTag } from '../../catalog/sports';
import { Article, FeedSource, Topic } from '../../types';
import { applyArticleStoryFallbacks } from '../../utils/articleStoryFallback';
import { hasRealHeroImage } from '../../utils/articleStoryMatch';
import { filterArticlesByBlocks, type BlockPreferenceFields } from '../notify/blockPreferences';
import {
  buildSourcePrimaryTopicMap,
  filterArticlesBySources,
} from '../notify/sourcePreferences';
import { filterArticlesBySportTags } from '../notify/sportPreferences';
import { filterArticlesByTopics, isAllTopicsEnabled } from '../notify/topicPreferences';
import { filterArticlesByReadingLearnings } from './readingLearnings';
import { type FeedPreferencesPayload } from './preferences';

/** Drop feed rows without a real hero image (after story dedupe at fetch). */
export function filterArticlesWithRealHeroImage(articles: Article[]): Article[] {
  return articles.filter(hasRealHeroImage);
}

/**
 * Picking a sport chip is an explicit request for that league's stories — a prior
 * "Show less" block on the same tag must not silently zero out the chip the reader
 * just tapped. Only the actively selected tag(s) are exempted; everything else the
 * reader blocked stays hidden.
 */
export function withoutActiveSportTagBlocks<P extends BlockPreferenceFields & { enabledSportTags: SportTag[] }>(
  prefs: P,
): P {
  if (prefs.enabledSportTags.length === 0) return prefs;
  const active = new Set<string>(prefs.enabledSportTags);
  // League chips always infer generic `soccer` alongside MLS / EPL / etc. A prior
  // "Show less Soccer" must not empty the MLS chip the reader just selected.
  if (prefs.enabledSportTags.some((tag) => SOCCER_LEAGUE_TAGS.includes(tag))) {
    active.add('soccer');
  }
  const blockedSportTags = prefs.blockedSportTags.filter((tag) => !active.has(tag));
  const blockedKeywords = prefs.blockedKeywords.filter(
    (keyword) => !active.has(keyword.trim().toLowerCase()),
  );
  if (
    blockedSportTags.length === prefs.blockedSportTags.length &&
    blockedKeywords.length === prefs.blockedKeywords.length
  ) {
    return prefs;
  }
  return { ...prefs, blockedSportTags, blockedKeywords };
}

/**
 * The filter pipeline, shared by the client's applyFeedFilters and /api/feed.
 *
 * `preferences` must already be normalized (normalizeFeedPreferences on the client,
 * which is also what the payload sent to the server reflects). Story fallbacks are
 * applied by the caller, since the server applies them across the whole candidate
 * pool before filtering while the client applies them per fetched page.
 */
export function filterFeedCandidates(
  articles: Article[],
  preferences: FeedPreferencesPayload,
  sources: FeedSource[],
): Article[] {
  let result = filterArticlesBySources(articles, sources, preferences.enabledSourceIds);

  if (!isAllTopicsEnabled(preferences.enabledTopics)) {
    const sourcePrimaryByName = buildSourcePrimaryTopicMap(sources);
    result = filterArticlesByTopics(result, preferences.enabledTopics, sourcePrimaryByName);
    result = filterArticlesBySportTags(
      result,
      preferences.enabledSportTags,
      preferences.enabledTopics,
    );
  }

  result = filterArticlesByBlocks(result, withoutActiveSportTagBlocks(preferences));

  const exemptTopics: Topic[] = [
    ...(isAllTopicsEnabled(preferences.enabledTopics) ? [] : preferences.enabledTopics),
    ...preferences.readingLearningsExemptTopics,
  ];

  result = filterArticlesByReadingLearnings(result, {
    engagementCount: preferences.engagementCount,
    sportsEngagementCount: preferences.sportsEngagementCount,
    topicScores: preferences.topicScores,
    sportTagScores: preferences.sportTagScores,
    exemptTopics,
    exemptSportTags: [
      ...preferences.enabledSportTags,
      ...preferences.readingLearningsExemptSportTags,
    ],
  });

  return filterArticlesWithRealHeroImage(result);
}

/** Full client-equivalent pipeline including story fallbacks. */
export function applyFeedCandidateFilters(
  articles: Article[],
  preferences: FeedPreferencesPayload,
  sources: FeedSource[],
): Article[] {
  return filterFeedCandidates(applyArticleStoryFallbacks(articles), preferences, sources);
}
