import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTheme } from '@/hooks/useTheme';
import { fetchArticleSearch } from '@/services/articles';
import { Article, SportTag, Topic } from '@/types';
import { prewarmForYouInterestFeedCache } from '@/utils/forYouInterestFeedCache';
import {
  buildKeywordHeroImageByKeyword,
  buildTopicHeroImageByTopic,
  ForYouSearchResult,
  keywordsFromArticleForQuery,
  searchForYouInterests,
} from '@/utils/forYouTopics';
import { formatInterestLabel } from '@/utils/interestKeywords';

interface ForYouTopicPickerProps {
  articles: Article[];
}

const GRID_GAP = 10;
const GRID_PADDING = 24;
const TILE_ASPECT = 1.15;

function SelectedTopicTile({
  topic,
  imageUrl,
  onOpen,
  onPrewarm,
  onRemove,
}: {
  topic: Topic;
  imageUrl?: string;
  onOpen: () => void;
  onPrewarm: () => void;
  onRemove: () => void;
}) {
  const { colors } = useTheme();
  const label = CURIOSITY_LABELS[topic];

  return (
    <View style={styles.tile}>
      <Pressable
        onPressIn={onPrewarm}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label} feed`}
        style={({ pressed }) => [styles.tileImageWrap, pressed && styles.pressed]}>
        {imageUrl ? (
          <ArticleImage uri={imageUrl} style={styles.tileImage} recyclingKey={topic} compact />
        ) : (
          <View style={[styles.tileImage, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="newspaper-outline" size={22} color={colors.accent} />
          </View>
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
          locations={[0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        hitSlop={8}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
        <Ionicons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function SelectedInterestTile({
  label,
  imageUrl,
  onOpen,
  onPrewarm,
  onRemove,
  recyclingKey,
}: {
  label: string;
  imageUrl?: string;
  onOpen: () => void;
  onPrewarm: () => void;
  onRemove: () => void;
  recyclingKey: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.tile}>
      <Pressable
        onPressIn={onPrewarm}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Open ${label} feed`}
        style={({ pressed }) => [styles.tileImageWrap, pressed && styles.pressed]}>
        {imageUrl ? (
          <ArticleImage uri={imageUrl} style={styles.tileImage} recyclingKey={recyclingKey} compact />
        ) : (
          <View style={[styles.tileImage, { backgroundColor: colors.accentMuted }]}>
            <Ionicons name="pricetag-outline" size={22} color={colors.accent} />
          </View>
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.78)']}
          locations={[0.35, 0.65, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <Text style={styles.tileLabel} numberOfLines={2}>
          {label}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label}`}
        hitSlop={8}
        style={({ pressed }) => [styles.removeButton, pressed && styles.pressed]}>
        <Ionicons name="close" size={14} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}

function resultIconName(kind: ForYouSearchResult['kind']): keyof typeof Ionicons.glyphMap {
  switch (kind) {
    case 'article':
      return 'newspaper-outline';
    case 'keyword':
      return 'pricetag-outline';
    case 'sportTag':
      return 'bicycle-outline';
    case 'topic':
      return 'grid-outline';
  }
}

export function ForYouTopicPicker({ articles }: ForYouTopicPickerProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const { articles: allArticles, feedGeneration } = useArticles();
  const {
    preferences,
    filterForYouFeedArticles,
    addForYouTopic,
    removeForYouTopic,
    addForYouKeyword,
    removeForYouKeyword,
    addForYouSportTag,
    removeForYouSportTag,
  } = usePreferences();
  const [query, setQuery] = useState('');
  const [remoteSearchArticles, setRemoteSearchArticles] = useState<Article[]>([]);
  const poolArticles = allArticles.length > 0 ? allArticles : articles;

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setRemoteSearchArticles([]);
      return;
    }

    let cancelled = false;
    const handle = setTimeout(() => {
      void fetchArticleSearch(trimmed, { limit: 25 }).then((result) => {
        if (!cancelled) setRemoteSearchArticles(result.articles);
      });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  const searchPool = useMemo(() => {
    const byId = new Map<string, Article>();
    for (const item of [...remoteSearchArticles, ...poolArticles]) {
      byId.set(item.id, item);
    }
    return [...byId.values()];
  }, [remoteSearchArticles, poolArticles]);

  const selectedTopics = preferences?.forYouTopics ?? [];
  const selectedKeywords = preferences?.forYouKeywords ?? [];
  const selectedSportTags = preferences?.forYouSportTags ?? [];
  const tileWidth = (width - GRID_PADDING * 2 - GRID_GAP) / 2;

  const searchResults = useMemo(() => {
    return searchForYouInterests(query, {
      articles: searchPool,
      exclude: {
        topics: selectedTopics,
        keywords: selectedKeywords,
        sportTags: selectedSportTags,
      },
    });
  }, [query, selectedTopics, selectedKeywords, selectedSportTags, searchPool]);

  const topicHeroImages = useMemo(
    () => buildTopicHeroImageByTopic(poolArticles, selectedTopics),
    [poolArticles, selectedTopics],
  );

  const keywordHeroImages = useMemo(
    () => buildKeywordHeroImageByKeyword(poolArticles, selectedKeywords),
    [poolArticles, selectedKeywords],
  );

  const sportTagHeroImages = useMemo(() => {
    const images = new Map<SportTag, string>();
    for (const tag of selectedSportTags) {
      for (const article of poolArticles) {
        if (!article.topics.includes('sports')) continue;
        const text = `${article.title} ${article.excerpt}`.toLowerCase();
        const label = SPORT_TAG_LABELS[tag].toLowerCase();
        if (text.includes(label) || text.includes(tag.replace('-', ' '))) {
          if (article.imageUrl) {
            images.set(tag, article.imageUrl);
            break;
          }
        }
      }
    }
    return images;
  }, [poolArticles, selectedSportTags]);

  const hasSelection =
    selectedTopics.length > 0 || selectedKeywords.length > 0 || selectedSportTags.length > 0;

  const openInterestFeed = useCallback(
    (kind: 'topic' | 'keyword' | 'sportTag', value: string) => {
      router.push({
        pathname: '/for-you/[type]/[value]',
        params: { type: kind, value },
      });
    },
    [router],
  );

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

  const handleOpenInterest = useCallback(
    (kind: 'topic' | 'keyword' | 'sportTag', value: string) => {
      prewarmInterestFeed(kind, value);
      openInterestFeed(kind, value);
    },
    [openInterestFeed, prewarmInterestFeed],
  );

  const handleSelectResult = (result: ForYouSearchResult) => {
    if (result.kind === 'topic' && result.topic) {
      void addForYouTopic(result.topic);
    } else if (result.kind === 'keyword' && result.keyword) {
      void addForYouKeyword(result.keyword);
    } else if (result.kind === 'sportTag' && result.sportTag) {
      void addForYouSportTag(result.sportTag);
    } else if (result.kind === 'article' && result.article) {
      const keywords = keywordsFromArticleForQuery(result.article, query);
      for (const keyword of keywords) {
        void addForYouKeyword(keyword);
      }
    }
    setQuery('');
  };

  if (!preferences) return null;

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <Text style={[styles.heading, { color: colors.text }]}>Your interests</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        Search for stories, keywords, or topics. Tap a tile to open its feed.
      </Text>

      <View
        style={[
          styles.searchField,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <Ionicons name="search" size={18} color={colors.textSecondary} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search interests…"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={[styles.searchInput, { color: colors.text }]}
          accessibilityLabel="Search interests"
        />
        {query.length > 0 ? (
          <Pressable
            onPress={() => setQuery('')}
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {query.trim().length > 0 ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          style={styles.resultsScroll}
          contentContainerStyle={styles.resultsContent}>
          {searchResults.length === 0 ? (
            <Text style={[styles.emptyResults, { color: colors.textSecondary }]}>
              No matching stories or interests yet. Try another search.
            </Text>
          ) : (
            searchResults.map((result) => (
              <Pressable
                key={result.key}
                onPress={() => handleSelectResult(result)}
                accessibilityRole="button"
                accessibilityLabel={`Add ${result.label}`}
                style={({ pressed }) => [
                  styles.resultRow,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  pressed && styles.pressed,
                ]}>
                {result.kind === 'article' && result.imageUrl ? (
                  <ArticleImage
                    uri={result.imageUrl}
                    style={styles.resultThumb}
                    recyclingKey={result.key}
                    compact
                  />
                ) : (
                  <View style={[styles.resultIconWrap, { backgroundColor: colors.accentMuted }]}>
                    <Ionicons name={resultIconName(result.kind)} size={16} color={colors.accent} />
                  </View>
                )}
                <View style={styles.resultTextWrap}>
                  <Text style={[styles.resultLabel, { color: colors.text }]} numberOfLines={2}>
                    {result.label}
                  </Text>
                  {result.subtitle ? (
                    <Text
                      style={[styles.resultSubtitle, { color: colors.textSecondary }]}
                      numberOfLines={1}>
                      {result.subtitle}
                    </Text>
                  ) : result.kind === 'keyword' ? (
                    <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                      Keyword interest
                    </Text>
                  ) : result.kind === 'sportTag' ? (
                    <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                      Sport interest
                    </Text>
                  ) : result.kind === 'topic' ? (
                    <Text style={[styles.resultSubtitle, { color: colors.textSecondary }]}>
                      Broad topic
                    </Text>
                  ) : null}
                </View>
                <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
              </Pressable>
            ))
          )}
        </ScrollView>
      ) : null}

      {hasSelection ? (
        <View style={styles.grid}>
          {selectedTopics.map((topic) => (
            <View key={`topic:${topic}`} style={{ width: tileWidth }}>
              <SelectedTopicTile
                topic={topic}
                imageUrl={topicHeroImages.get(topic)}
                onPrewarm={() => prewarmInterestFeed('topic', topic)}
                onOpen={() => handleOpenInterest('topic', topic)}
                onRemove={() => void removeForYouTopic(topic)}
              />
            </View>
          ))}
          {selectedKeywords.map((keyword) => (
            <View key={`keyword:${keyword}`} style={{ width: tileWidth }}>
              <SelectedInterestTile
                label={formatInterestLabel(keyword)}
                imageUrl={keywordHeroImages.get(keyword)}
                recyclingKey={keyword}
                onPrewarm={() => prewarmInterestFeed('keyword', keyword)}
                onOpen={() => handleOpenInterest('keyword', keyword)}
                onRemove={() => void removeForYouKeyword(keyword)}
              />
            </View>
          ))}
          {selectedSportTags.map((tag) => (
            <View key={`sport:${tag}`} style={{ width: tileWidth }}>
              <SelectedInterestTile
                label={SPORT_TAG_LABELS[tag]}
                imageUrl={sportTagHeroImages.get(tag)}
                recyclingKey={tag}
                onPrewarm={() => prewarmInterestFeed('sportTag', tag)}
                onOpen={() => handleOpenInterest('sportTag', tag)}
                onRemove={() => void removeForYouSportTag(tag)}
              />
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.emptySelection, { color: colors.textSecondary }]}>
          No interests selected yet.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 10,
  },
  heading: {
    fontFamily: 'InterMedium',
    fontSize: 15,
    paddingHorizontal: GRID_PADDING,
  },
  hint: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    paddingHorizontal: GRID_PADDING,
  },
  searchField: {
    marginHorizontal: GRID_PADDING,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 15,
    paddingVertical: 0,
  },
  resultsScroll: {
    maxHeight: 220,
    marginHorizontal: GRID_PADDING,
  },
  resultsContent: {
    gap: 8,
  },
  resultRow: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resultThumb: {
    width: 40,
    height: 40,
    borderRadius: 8,
  },
  resultIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  resultLabel: {
    fontFamily: 'InterMedium',
    fontSize: 14,
  },
  resultSubtitle: {
    fontFamily: 'Inter',
    fontSize: 12,
    marginTop: 2,
  },
  emptyResults: {
    fontFamily: 'Inter',
    fontSize: 13,
    paddingVertical: 8,
  },
  grid: {
    paddingHorizontal: GRID_PADDING,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    position: 'relative',
  },
  tileImageWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    aspectRatio: TILE_ASPECT,
    justifyContent: 'flex-end',
  },
  tileImage: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    lineHeight: 17,
    color: '#FFFFFF',
    paddingHorizontal: 10,
    paddingBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  removeButton: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySelection: {
    fontFamily: 'Inter',
    fontSize: 13,
    paddingHorizontal: GRID_PADDING,
  },
  pressed: {
    opacity: 0.75,
  },
});
