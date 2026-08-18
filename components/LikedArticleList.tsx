import { Ionicons } from '@expo/vector-icons';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { FeedHeader } from '@/components/FeedHeader';
import { LikedArticleRow } from '@/components/LikedArticleRow';
import { tabBarOverlayInset } from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';

interface LikedArticleListProps {
  articles: Article[];
  title: string;
  subtitle?: string;
  emptyMessage?: string;
  isRefreshing?: boolean;
  onRefresh?: () => void;
  headerExtra?: React.ReactNode;
  onArticleLongPress?: (article: Article) => void;
}

export function LikedArticleList({
  articles,
  title,
  subtitle,
  emptyMessage,
  isRefreshing,
  onRefresh,
  headerExtra,
  onArticleLongPress,
}: LikedArticleListProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FeedHeader title={title} subtitle={subtitle} />
      {headerExtra}

      <FlatList
        data={articles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <LikedArticleRow
            article={item}
            onLongPress={
              onArticleLongPress ? () => onArticleLongPress(item) : undefined
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={[styles.emptyIconWrap, { backgroundColor: colors.surface }]}>
              <Ionicons name="heart-outline" size={28} color={colors.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {emptyMessage ?? 'No articles yet.'}
            </Text>
          </View>
        }
        contentContainerStyle={
          articles.length === 0
            ? styles.emptyList
            : { paddingBottom: 16 + tabBarOverlayInset() }
        }
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={!!isRefreshing}
              onRefresh={onRefresh}
              tintColor={colors.text}
              colors={[colors.text]}
              progressBackgroundColor={colors.surface}
            />
          ) : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyList: {
    flexGrow: 1,
  },
  emptyState: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingTop: 48,
  },
  emptyIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    maxWidth: 300,
  },
});
