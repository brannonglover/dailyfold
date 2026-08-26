import { useMemo, useState, memo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ReadingArticleList } from '@/components/ReadingArticleList';
import { ReadingSegment } from '@/components/ReadingSegmentBar';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useLikedArticles } from '@/hooks/useLikedArticles';
import { useReadingHistory } from '@/hooks/useReadingHistory';
import { useTheme } from '@/hooks/useTheme';

function SavedScreenContent() {
  const { colors } = useTheme();
  const { preferences } = usePreferences();
  const [segment, setSegment] = useState<ReadingSegment>('continue');
  const {
    articles: continueArticles,
    isLoading: isContinueLoading,
    isRefreshing: isContinueRefreshing,
    error: continueError,
    notice: continueNotice,
    refresh: refreshContinue,
  } = useReadingHistory();
  const {
    articles: readLaterArticles,
    isLoading: isReadLaterLoading,
    isRefreshing: isReadLaterRefreshing,
    error: readLaterError,
    notice: readLaterNotice,
    refresh: refreshReadLater,
  } = useLikedArticles();

  const engagementByArticleId = useMemo(() => {
    const engagement = preferences?.articleEngagement ?? {};
    const map: Record<string, number | undefined> = {};
    for (const [id, entry] of Object.entries(engagement)) {
      map[id] = entry.readPercent;
    }
    return map;
  }, [preferences?.articleEngagement]);

  const displayed =
    segment === 'continue' ? continueArticles : readLaterArticles;
  const isLoading = segment === 'continue' ? isContinueLoading : isReadLaterLoading;
  const isRefreshing =
    segment === 'continue' ? isContinueRefreshing : isReadLaterRefreshing;
  const error = segment === 'continue' ? continueError : readLaterError;
  const notice = segment === 'continue' ? continueNotice : readLaterNotice;
  const refresh = segment === 'continue' ? refreshContinue : refreshReadLater;

  const readLaterCount = preferences?.likedArticleIds.length ?? 0;
  const continueCount = continueArticles.length;

  const emptyMessage =
    segment === 'continue'
      ? isContinueLoading
        ? 'Loading your reading history…'
        : 'Start reading any story from Latest or For You — your place is saved here automatically.'
      : readLaterCount > 0 && readLaterArticles.length === 0
        ? 'Loading your queue…'
        : 'Tap Read Later on any story to save it here. One queue, no folders.';

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <ReadingArticleList
        articles={displayed}
        segment={segment}
        continueCount={continueCount}
        readLaterCount={readLaterCount}
        onSelectSegment={setSegment}
        engagementByArticleId={engagementByArticleId}
        emptyMessage={notice ?? error ?? emptyMessage}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />
    </View>
  );
}

export default memo(function SavedScreen() {
  return <SavedScreenContent />;
});

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
