import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { FolderPickerModal } from '@/components/FolderPickerModal';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import { shareArticle } from '@/utils/shareArticle';

interface ArticleActionsProps {
  article: Article;
  modalBottomOffset?: number;
}

export function ArticleActions({
  article,
  modalBottomOffset,
}: ArticleActionsProps) {
  const { colors } = useTheme();
  const { isLiked, toggleLike } = usePreferences();
  const liked = isLiked(article.id);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  async function handleLike() {
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    await toggleLike(article);
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
    <>
      <View style={[styles.actions, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Pressable
          onPress={handleLike}
          style={({ pressed }) => [
            styles.actionButton,
            liked && { backgroundColor: colors.accentMuted },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={liked ? 'Unlike article' : 'Like article'}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? colors.accent : colors.textSecondary}
          />
          <Text style={[styles.actionLabel, { color: liked ? colors.accent : colors.textSecondary }]}>
            {liked ? 'Liked' : 'Like'}
          </Text>
        </Pressable>

        {liked ? (
          <Pressable
            onPress={() => setShowFolderPicker(true)}
            style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Add to folder">
            <Ionicons name="folder-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>Folder</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [styles.actionButton, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Share article link"
          accessibilityHint="Shares the original publisher link so it can be opened in any app">
          <Ionicons name="share-outline" size={22} color={colors.textSecondary} />
          <Text style={[styles.actionLabel, { color: colors.textSecondary }]}>
            {liked ? 'Share' : 'Share link'}
          </Text>
        </Pressable>

      </View>

      <FolderPickerModal
        visible={showFolderPicker}
        articleId={article.id}
        bottomOffset={modalBottomOffset}
        onClose={() => setShowFolderPicker(false)}
      />
    </>
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
    flexBasis: '30%',
    minWidth: 88,
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
