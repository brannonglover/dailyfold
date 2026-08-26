import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { formatReadProgressLabel } from '@/services/articleEngagement';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import { openFeedArticle, warmArticleOpen } from '@/utils/openFeedArticle';

interface ReadingArticleRowProps {
  article: Article;
  readPercent?: number;
  /** When true, always show progress — used for Continue rows. */
  showProgress?: boolean;
  showThumbnail?: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function ReadingArticleRow({
  article,
  readPercent,
  showProgress = false,
  showThumbnail = true,
}: ReadingArticleRowProps) {
  const { colors } = useTheme();
  const progressLabel = formatReadProgressLabel(readPercent, { showWhenEmpty: showProgress });
  const clampedPercent = Math.min(100, Math.max(0, readPercent ?? 0));

  function openArticle() {
    void openFeedArticle(article);
  }

  return (
    <Pressable
      onPressIn={() => warmArticleOpen(article)}
      onPress={openArticle}
      accessibilityRole="button"
      accessibilityLabel={`Open ${article.title}`}
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
        {progressLabel ? (
          <View style={styles.progressWrap}>
            <View style={[styles.progressTrack, { backgroundColor: colors.surface }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: colors.accent,
                    width: `${clampedPercent}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {progressLabel}
            </Text>
          </View>
        ) : null}
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
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  progressTrack: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressLabel: {
    fontFamily: 'InterMedium',
    fontSize: 11,
    minWidth: 56,
    textAlign: 'right',
  },
});
