import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { Article, SportTag, Topic } from '@/types';
import { prewarmForYouInterestFeedCache } from '@/utils/forYouInterestFeedCache';
import { useArticles } from '@/hooks/useArticles';
import { formatInterestLabel } from '@/utils/interestKeywords';
import {
  articleMatchesForYouKeywords,
  articleMatchesForYouSportTags,
  articleMatchesForYouTopics,
} from '@/utils/forYouTopics';

const GRID_GAP = 10;
const GRID_PADDING = 24;
/**
 * Interests longer than this display full-width instead of half-width.
 * At half-width on a 375pt screen (iPhone SE), InterSemiBold 15px fits roughly
 * 10–12 chars per line with 2 lines available, giving ~20–24 chars total.
 * We use 20 as a conservative cutoff to avoid truncation on small screens.
 */
const LONG_INTEREST_THRESHOLD = 20;

interface ForYouInterestCardsProps {
  articles: Article[];
  onAddInterest: () => void;
}

interface InterestItem {
  kind: 'topic' | 'keyword' | 'sportTag';
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  storyCount: number;
}

function interestIcon(kind: InterestItem['kind'], value: string): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'topic':
      return 'grid-outline';
    case 'sportTag':
      return 'bicycle-outline';
    case 'keyword':
      return 'sparkles-outline';
  }
}

function InterestCard({
  item,
  width,
  onPress,
  onPressIn,
}: {
  item: InterestItem;
  width: number | '100%';
  onPress: () => void;
  onPressIn: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPressIn={onPressIn}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.label}, ${item.storyCount} stories`}
      style={({ pressed }) => [
        styles.card,
        {
          width,
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
        pressed && styles.cardPressed,
      ]}>
      <View style={styles.cardTop}>
        <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
          <Ionicons name={item.icon} size={14} color={colors.accent} />
        </View>
        <Ionicons name="chevron-forward" size={14} color={colors.textSecondary} />
      </View>
      <Text style={[styles.cardName, { color: colors.text }]} numberOfLines={2}>
        {item.label}
      </Text>
      {item.storyCount > 0 ? (
        <Text style={[styles.cardCount, { color: colors.textSecondary }]}>
          {item.storyCount} {item.storyCount === 1 ? 'story' : 'stories'}
        </Text>
      ) : (
        <Text style={[styles.cardCount, { color: colors.textSecondary }]}>No stories yet</Text>
      )}
    </Pressable>
  );
}

export function ForYouInterestCards({ articles, onAddInterest }: ForYouInterestCardsProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { articles: allArticles, feedGeneration } = useArticles();
  const {
    preferences,
    filterForYouFeedArticles,
  } = usePreferences();

  const poolArticles = allArticles.length > 0 ? allArticles : articles;

  const filteredPool = useMemo(
    () => filterForYouFeedArticles(poolArticles),
    [filterForYouFeedArticles, poolArticles],
  );

  const interests: InterestItem[] = useMemo(() => {
    if (!preferences) return [];
    const items: InterestItem[] = [];

    for (const topic of preferences.forYouTopics ?? []) {
      const count = filteredPool.filter((a) => articleMatchesForYouTopics(a, [topic])).length;
      items.push({
        kind: 'topic',
        value: topic,
        label: CURIOSITY_LABELS[topic] ?? formatInterestLabel(topic),
        icon: interestIcon('topic', topic),
        storyCount: count,
      });
    }

    for (const keyword of preferences.forYouKeywords ?? []) {
      const count = filteredPool.filter((a) => articleMatchesForYouKeywords(a, [keyword])).length;
      items.push({
        kind: 'keyword',
        value: keyword,
        label: formatInterestLabel(keyword),
        icon: interestIcon('keyword', keyword),
        storyCount: count,
      });
    }

    for (const tag of preferences.forYouSportTags ?? []) {
      const count = filteredPool.filter((a) => articleMatchesForYouSportTags(a, [tag])).length;
      items.push({
        kind: 'sportTag',
        value: tag,
        label: SPORT_TAG_LABELS[tag] ?? formatInterestLabel(tag),
        icon: interestIcon('sportTag', tag),
        storyCount: count,
      });
    }

    return items;
  }, [preferences, filteredPool]);

  const tileWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

  const prewarmInterestFeed = useCallback(
    (kind: 'topic' | 'keyword' | 'sportTag', value: string) => {
      if (poolArticles.length === 0) return;
      prewarmForYouInterestFeedCache(
        poolArticles,
        kind,
        value,
        filterForYouFeedArticles,
        feedGeneration,
      );
    },
    [poolArticles, feedGeneration, filterForYouFeedArticles],
  );

  const openInterestFeed = useCallback(
    (kind: 'topic' | 'keyword' | 'sportTag', value: string) => {
      prewarmInterestFeed(kind, value);
      router.push({
        pathname: '/for-you/[type]/[value]',
        params: { type: kind, value },
      });
    },
    [router, prewarmInterestFeed],
  );

  if (interests.length === 0) return null;

  // Lay out cards: short labels get half-width, long labels get full-width.
  // Build rows to decide widths.
  const rows: { items: InterestItem[]; widths: (number | '100%')[] }[] = [];
  let pendingHalf: InterestItem | null = null;

  for (const item of interests) {
    const isLong = item.label.length > LONG_INTEREST_THRESHOLD;
    if (isLong) {
      if (pendingHalf) {
        rows.push({ items: [pendingHalf], widths: [tileWidth] });
        pendingHalf = null;
      }
      rows.push({ items: [item], widths: ['100%'] });
    } else {
      if (pendingHalf) {
        rows.push({ items: [pendingHalf, item], widths: [tileWidth, tileWidth] });
        pendingHalf = null;
      } else {
        pendingHalf = item;
      }
    }
  }
  if (pendingHalf) {
    rows.push({ items: [pendingHalf], widths: [tileWidth] });
  }

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>Your interests</Text>

      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.row}>
            {row.items.map((item, i) => (
              <InterestCard
                key={`${item.kind}:${item.value}`}
                item={item}
                width={row.widths[i]}
                onPressIn={() => prewarmInterestFeed(item.kind, item.value)}
                onPress={() => openInterestFeed(item.kind, item.value)}
              />
            ))}
          </View>
        ))}
      </View>

      <Pressable
        onPress={onAddInterest}
        accessibilityRole="button"
        accessibilityLabel="Add an interest"
        style={({ pressed }) => [
          styles.addButton,
          { borderColor: colors.border },
          pressed && styles.cardPressed,
        ]}>
        <Ionicons name="add" size={18} color={colors.accent} />
        <Text style={[styles.addButtonText, { color: colors.accent }]}>Add an interest</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 20,
    gap: 12,
  },
  sectionTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    paddingHorizontal: GRID_PADDING,
  },
  grid: {
    paddingHorizontal: GRID_PADDING,
    gap: GRID_GAP,
  },
  row: {
    flexDirection: 'row',
    gap: GRID_GAP,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 4,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardName: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
  cardCount: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  addButton: {
    marginHorizontal: GRID_PADDING,
    borderWidth: 1,
    borderRadius: 14,
    borderStyle: 'dashed',
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  addButtonText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
  },
});
