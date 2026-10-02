import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import { memo, startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View } from 'react-native';

import { AddInterestModal } from '@/components/AddInterestModal';
import { ArticleFeedScreen } from '@/components/ArticleFeedScreen';
import { ForYouInterestCards } from '@/components/ForYouInterestCards';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTabDisplayState } from '@/hooks/useTabDisplayState';
import { useTheme } from '@/hooks/useTheme';
import { getForYouFeed } from '@/services/recommendations';
import { isAllSourcesEnabled } from '@/services/sourcePreferences';
import { getForYouEmptyMessage } from '@/utils/feedEmptyMessage';
import { buildForYouKickersByArticleId } from '@/utils/forYouInterestMatch';
import { buildForYouCacheKeys } from '@/utils/forYouPrewarm';
import { hasForYouTopicSelection } from '@/utils/forYouTopics';
import { resolveTabDisplayFeed } from '@/utils/tabDisplayCache';

/**
 * Redesigned For You tab with two sections:
 *
 * 1. **Your Interests** — rounded cards with story counts
 * 2. **For You Today** — mixed editorial feed from all interests (fold layout)
 *
 * When no interests exist, shows an onboarding experience instead.
 */
function ForYouScreenContent() {
  const isFocused = useIsFocused();
  const { colors } = useTheme();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const {
    preferences,
    isLoading: isPreferencesLoading,
    filterForYouFeedArticles,
    recordFeedClick,
  } = usePreferences();
  const {
    articles,
    feedGeneration,
    isLoading,
    isRefreshing,
    error,
    notice,
    usingDemoArticles,
    refresh,
  } = useArticles();

  const preferencesReady = preferences != null;
  const hasInterests = preferencesReady && hasForYouTopicSelection(preferences);

  const { feedFilterKey, personalizationKey } = useMemo(
    () =>
      preferences
        ? buildForYouCacheKeys(preferences)
        : { feedFilterKey: '', personalizationKey: '' },
    [preferences],
  );

  const { displayArticles, displayReady, setDisplayArticles, setDisplayReady } =
    useTabDisplayState('for-you', feedFilterKey, {
      feedGeneration,
      rawLength: articles.length,
      personalizationKey,
    });

  const rankTaskRef = useRef<ReturnType<typeof InteractionManager.runAfterInteractions> | null>(
    null,
  );

  useEffect(() => {
    if (!isFocused || !preferences || !hasInterests || articles.length === 0) return;

    let cancelled = false;
    rankTaskRef.current?.cancel();
    rankTaskRef.current = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      const filtered = filterForYouFeedArticles(articles);
      const ranked = getForYouFeed(filtered, preferences);
      startTransition(() => {
        if (cancelled) return;
        setDisplayArticles(ranked);
        setDisplayReady(true);
      });
    });

    return () => {
      cancelled = true;
      rankTaskRef.current?.cancel();
    };
  }, [
    isFocused,
    articles,
    preferences,
    hasInterests,
    filterForYouFeedArticles,
    setDisplayArticles,
    setDisplayReady,
  ]);

  useEffect(() => {
    if (hasInterests) return;
    setDisplayArticles([]);
    setDisplayReady(false);
  }, [hasInterests, setDisplayArticles, setDisplayReady]);

  const feedArticles = useMemo(
    () =>
      resolveTabDisplayFeed({
        contextLoading: isLoading,
        displayArticles,
        displayReady,
        tabKey: 'for-you',
        feedGeneration,
        rawLength: articles.length,
        filterKey: feedFilterKey,
        personalizationKey,
      }),
    [
      isLoading,
      displayArticles,
      displayReady,
      feedGeneration,
      articles.length,
      feedFilterKey,
      personalizationKey,
    ],
  );

  const matchReasonsByArticleId = useMemo(() => {
    if (!preferences || feedArticles.length === 0) return new Map<string, string[]>();
    return buildForYouKickersByArticleId(feedArticles, preferences);
  }, [preferences, feedArticles]);

  const emptyMessage = useMemo(() => {
    if (!hasInterests) return undefined;
    if (feedArticles.length > 0) return undefined;
    const filtered = filterForYouFeedArticles(articles);
    return getForYouEmptyMessage({
      error,
      totalCount: articles.length,
      filteredCount: feedArticles.length,
      sourceFilteredCount: filtered.length,
      enabledTopics: preferences?.enabledTopics,
      enabledSportTags: preferences?.enabledSportTags,
      sourcesRestricted: !!preferences && !isAllSourcesEnabled(preferences.enabledSourceIds),
      usingDemoArticles,
      hasForYouTopics: true,
    });
  }, [
    hasInterests,
    error,
    articles,
    feedArticles.length,
    filterForYouFeedArticles,
    preferences,
    usingDemoArticles,
  ]);

  const showFeedLoading =
    hasInterests && (isPreferencesLoading || isLoading) && feedArticles.length === 0;

  const openAddModal = useCallback(() => setAddModalVisible(true), []);
  const closeAddModal = useCallback(() => setAddModalVisible(false), []);

  const headerExtra = useMemo(() => {
    if (!preferencesReady) return null;

    if (!hasInterests) {
      return <ForYouOnboarding onAddInterest={openAddModal} />;
    }

    return (
      <View>
        <ForYouInterestCards articles={articles} onAddInterest={openAddModal} />
        {(feedArticles.length > 0 || showFeedLoading) ? (
          <ForYouTodayHeader />
        ) : null}
      </View>
    );
  }, [preferencesReady, hasInterests, articles, feedArticles.length, showFeedLoading, openAddModal]);

  return (
    <>
      <ArticleFeedScreen
        articles={hasInterests ? feedArticles : []}
        title="For You"
        emptyMessage={emptyMessage}
        isLoading={showFeedLoading}
        isRefreshing={isRefreshing}
        error={error}
        notice={notice}
        onRefresh={refresh}
        matchReasonsByArticleId={matchReasonsByArticleId}
        onFeedClick={recordFeedClick}
        layout="fold"
        headerExtra={headerExtra}
      />
      <AddInterestModal visible={addModalVisible} onClose={closeAddModal} />
    </>
  );
}

function ForYouTodayHeader() {
  const { colors } = useTheme();

  return (
    <View style={[forYouStyles.todayHeader, { borderTopColor: colors.border }]}>
      <Text style={[forYouStyles.todayTitle, { color: colors.text }]}>For You Today</Text>
      <Text style={[forYouStyles.todaySubtitle, { color: colors.textSecondary }]}>
        The best from your interests
      </Text>
    </View>
  );
}

function ForYouOnboarding({ onAddInterest }: { onAddInterest: () => void }) {
  const { colors } = useTheme();

  return (
    <View style={forYouStyles.onboarding}>
      <View style={[forYouStyles.onboardingIconWrap, { backgroundColor: colors.accentMuted }]}>
        <Ionicons name="sparkles" size={28} color={colors.accent} />
      </View>
      <Text style={[forYouStyles.onboardingTitle, { color: colors.text }]}>
        Make Dailyfold yours
      </Text>
      <Text style={[forYouStyles.onboardingBody, { color: colors.textSecondary }]}>
        Follow the topics you actually care about and Dailyfold will find the stories worth reading.
      </Text>
      <Pressable
        onPress={onAddInterest}
        accessibilityRole="button"
        accessibilityLabel="Add your first interest"
        style={({ pressed }) => [
          forYouStyles.onboardingButton,
          { backgroundColor: colors.text },
          pressed && { opacity: 0.85 },
        ]}>
        <Ionicons name="add" size={18} color={colors.background} />
        <Text style={[forYouStyles.onboardingButtonText, { color: colors.background }]}>
          Add your first interest
        </Text>
      </Pressable>

      <View style={forYouStyles.onboardingExamples}>
        <Text style={[forYouStyles.onboardingExamplesLabel, { color: colors.textSecondary }]}>
          People follow interests like
        </Text>
        <View style={forYouStyles.onboardingChips}>
          {['Bike Repair', 'AI Development', 'Fantasy Books', 'Vintage MTB'].map((example) => (
            <View
              key={example}
              style={[forYouStyles.onboardingChip, { borderColor: colors.border }]}>
              <Text style={[forYouStyles.onboardingChipText, { color: colors.textSecondary }]}>
                {example}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const forYouStyles = StyleSheet.create({
  todayHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  todayTitle: {
    fontFamily: 'LoraBold',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  todaySubtitle: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 3,
  },
  onboarding: {
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 32,
    alignItems: 'center',
    gap: 12,
  },
  onboardingIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  onboardingTitle: {
    fontFamily: 'LoraBold',
    fontSize: 24,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  onboardingBody: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
  onboardingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  onboardingButtonText: {
    fontFamily: 'InterSemiBold',
    fontSize: 16,
  },
  onboardingExamples: {
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
  },
  onboardingExamplesLabel: {
    fontFamily: 'Inter',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  onboardingChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  onboardingChip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  onboardingChipText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
});

export default memo(function ForYouScreen() {
  return <ForYouScreenContent />;
});
