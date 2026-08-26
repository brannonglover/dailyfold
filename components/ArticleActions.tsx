import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import { shareArticle } from '@/utils/shareArticle';

interface ArticleActionsProps {
  article: Article;
}

export function ArticleActions({ article }: ArticleActionsProps) {
  const { colors } = useTheme();
  const { isLiked, toggleLike } = usePreferences();
  const savedForLater = isLiked(article.id);

  function handleReadLater() {
    toggleLike(article);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  async function handleShare() {
    try {
      await shareArticle(article);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not share this article.';
      if (Platform.OS === 'web') {
        window.alert(message);
      } else {
        Alert.alert('Unable to share', message);
      }
    }
  }

  return (
    <View style={[styles.actions, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
      <Pressable
        onPress={handleReadLater}
        style={({ pressed }) => [
          styles.actionButton,
          savedForLater && { backgroundColor: colors.accentMuted },
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={savedForLater ? 'Remove from Read Later' : 'Save for Read Later'}>
        <Ionicons
          name={savedForLater ? 'bookmark' : 'bookmark-outline'}
          size={22}
          color={savedForLater ? colors.accent : colors.textSecondary}
        />
        <Text style={[styles.actionLabel, { color: savedForLater ? colors.accent : colors.textSecondary }]}>
          {savedForLater ? 'Saved' : 'Read Later'}
        </Text>
      </Pressable>

      <Pressable
        onPress={handleShare}
        style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
        accessibilityRole="button"
        accessibilityLabel="Share article link"
        accessibilityHint="Shares the original publisher link so it can be opened in any app">
        <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
        <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Share</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flexGrow: 1,
    flexBasis: '45%',
    minWidth: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionLabel: {
    fontFamily: 'InterMedium',
    fontSize: 14,
  },
});
