import { engagementSignalMultiplier } from '@/services/articleEngagement';
import { resolveClickedArticles } from '@/services/clickedArticles';
import { buildInterestProfile } from '@/services/interestSignals';
import { resolveLikedArticles } from '@/services/likedArticles';
import { readingLearningsSignals } from '@/services/readingLearnings';
import { penalizedSportTags, penalizedTopics } from '@/shared/feed/readingLearnings';
import { hasInterestSignals } from '@/shared/notify/interestSignals';
import { emptyRankingProfile, type RankingProfile } from '@/shared/feed/types';
import { Article, UserPreferences } from '@/types';

const LIKE_BOOST = 1;
const CLICK_BOOST = 0.5;

/** Per-outlet affinity from likes plus engagement-weighted clicks. */
export function buildSourceAffinityScores(
  prefs: UserPreferences,
  feedArticles: Article[],
): Record<string, number> {
  const scores: Record<string, number> = {};
  const liked = resolveLikedArticles(
    prefs.likedArticleIds,
    prefs.likedArticles ?? {},
    feedArticles,
  );
  const clicked = resolveClickedArticles(
    prefs.clickedArticleIds ?? [],
    prefs.clickedArticles ?? {},
    feedArticles,
  ).filter((item) => !prefs.likedArticleIds.includes(item.id));

  for (const item of liked) {
    scores[item.source] = (scores[item.source] ?? 0) + LIKE_BOOST;
  }
  for (const item of clicked) {
    const engagement = prefs.articleEngagement?.[item.id];
    scores[item.source] =
      (scores[item.source] ?? 0) + CLICK_BOOST * engagementSignalMultiplier(engagement);
  }
  return scores;
}

/**
 * Flatten on-device preferences into the profile the shared ranker consumes.
 *
 * `feedArticles` resolves liked/clicked IDs that have no stored snapshot, so pass
 * the candidate pool being ranked.
 */
export function buildRankingProfile(
  prefs: UserPreferences | null,
  feedArticles: Article[] = [],
): RankingProfile {
  if (!prefs) return emptyRankingProfile();

  const profile = buildInterestProfile(prefs, feedArticles);
  const signals = readingLearningsSignals(prefs);

  return {
    interestScores: profile && hasInterestSignals(profile) ? profile : null,
    sourceAffinityScores: buildSourceAffinityScores(prefs, feedArticles),
    engagementCount: signals.engagementCount,
    sportsTopicScore: prefs.topicScores?.sports ?? 0,
    hiddenTopics: penalizedTopics(signals),
    hiddenSportTags: penalizedSportTags(signals),
  };
}
