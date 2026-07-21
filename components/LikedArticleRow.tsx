import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import { openFeedArticle, warmArticleOpen } from '@/utils/openFeedArticle';

interface LikedArticleRowProps {
  article: Article;
  showThumbnail?: boolean;
  onLongPress?: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function LikedArticleRow({
  article,
  showThumbnail = true,
  onLongPress,
}: LikedArticleRowProps) {
  const { colors } = useTheme();

  function openArticle() {
    void openFeedArticle(article);
  }

  async function handleLongPress() {
    if (!onLongPress) return;
    if (Platform.OS !== 'web') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onLongPress();
  }

  return (
    <Pressable
      onPressIn={() => warmArticleOpen(article)}
      onPress={openArticle}
      onLongPress={onLongPress ? () => void handleLongPress() : undefined}
      delayLongPress={400}
      accessibilityRole="button"
      accessibilityLabel={`Open ${article.title}`}
      accessibilityHint={
        onLongPress ? 'Long press to add this article to folders' : undefined
      }
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.border },
        pressed && { opacity: 0.7 },
      ]}>
      {showThumbnail ? (
        <ArticleImage
          uri={article.imageUrl}
          style={styles.thumbnail}
          compact
          source={article.source}
          sourceLogo={article.sourceLogo}
        />
      ) : null}

      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
          {article.title}
        </Text>
        <Text style={[styles.meta, { color: colors.textSecondary }]} numberOfLines={1}>
          <Text style={[styles.source, { color: colors.accent }]}>{article.source}</Text>
          {' · '}
          {formatDate(article.publishedAt)}
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    flexShrink: 0,
  },
  textWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  title: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
  meta: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
  },
  source: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
  },
});
