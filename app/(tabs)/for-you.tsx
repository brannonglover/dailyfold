import { memo } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ForYouTopicPicker } from '@/components/ForYouTopicPicker';
import { FeedHeader } from '@/components/FeedHeader';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTheme } from '@/hooks/useTheme';
import { hasForYouTopicSelection } from '@/utils/forYouTopics';

function ForYouScreenContent() {
  const { colors } = useTheme();
  const { preferences, isLoading: isPreferencesLoading } = usePreferences();
  const { articles } = useArticles();

  const preferencesReady = preferences != null;
  const hasInterests = preferencesReady && hasForYouTopicSelection(preferences);
  const isLoading = isPreferencesLoading && !preferencesReady;

  return (
    <View style={[styles.flex, { backgroundColor: colors.background }]}>
      <FeedHeader title="For You" />
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <ForYouTopicPicker articles={articles} />
          {!hasInterests ? (
            <Text style={[styles.emptyPrompt, { color: colors.textSecondary }]}>
              Search for stories, keywords, or topics to build your personalized feeds.
            </Text>
          ) : (
            <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
              Tap an interest to open its feed.
            </Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

export default memo(function ForYouScreen() {
  return <ForYouScreenContent />;
});

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrompt: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  tapHint: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: 24,
    marginTop: 4,
  },
});
