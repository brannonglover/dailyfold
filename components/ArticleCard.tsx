import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { ArticleSourceMenu } from '@/components/ArticleSourceMenu';
import { FolderPickerModal } from '@/components/FolderPickerModal';
import { FoldedImage } from '@/components/FoldedImage';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import {
  ARTICLE_CARD_HERO_VIGNETTE_GRADIENT_LOCATIONS,
  ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO,
  FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT,
  FOLD_GRID_IMAGE_ASPECT,
  FOLD_ROW_IMAGE_SIZE,
  STORY_CARD_IMAGE_ASPECT,
  STORY_CARD_LEAD_IMAGE_ASPECT,
} from '@/constants/Layout';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { Article } from '@/types';
import { openFeedArticle, warmArticleOpen } from '@/utils/openFeedArticle';

type ArticleCardVariant = 'default' | 'story' | 'storyLead' | 'storyPage' | 'storyGrid' | 'storyRow';

interface ArticleCardProps {
  article: Article;
  height?: number;
  variant?: ArticleCardVariant;
  /** For You only — which liked-interest signals matched this article (max 3). */
  matchReasons?: string[];
  /** Latest/For You feed opens — records curiosity signal, not a like. */
  onFeedClick?: (article: Article) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/** Fold layout kicker: leads with the article's primary topic, not the source. */
function articleKicker(article: Article) {
  return article.topics.length > 0 ? CURIOSITY_LABELS[article.topics[0]] : article.source;
}

const IMAGE_HEIGHT_MAX = 220;
const IMAGE_HEIGHT_RATIO = 0.32;
/** Never collapse the hero to 0 on short cards (common on physical devices with more chrome). */
const HERO_IMAGE_MIN_HEIGHT = 120;

function withAlpha(hex: string, alpha: number) {
  const clamped = Math.min(1, Math.max(0, alpha));
  const alphaHex = Math.round(clamped * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${alphaHex}`;
}

/** Keeps excerpt + CTA above the feed bottom vignette overlay */
const VIGNETTE_TEXT_CLEARANCE = Math.round(FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT * 0.4);
const EXCERPT_FONT_SIZE = 16;
const EXCERPT_LINE_HEIGHT = 24;
const EXCERPT_LINES = 2;
/** 48px theoretical; +4px so Inter's ascenders don't clip the second line in a fixed slot */
const EXCERPT_SLOT_HEIGHT = EXCERPT_LINES * EXCERPT_LINE_HEIGHT + 4;
const TITLE_LINE_HEIGHT = 32;
const READ_MORE_LINE_HEIGHT = 22;

/** Fixed chrome below the hero: meta, topics cap, 2-line excerpt slot, CTA, padding. */
const TEXT_BLOCK_CHROME_HEIGHT =
  6 +
  VIGNETTE_TEXT_CLEARANCE +
  28 +
  52 +
  4 +
  EXCERPT_SLOT_HEIGHT +
  4 +
  READ_MORE_LINE_HEIGHT;

/** Minimum vertical space for text; one title line reserved for image-height budgeting. */
const TEXT_BLOCK_MIN_HEIGHT = TEXT_BLOCK_CHROME_HEIGHT + TITLE_LINE_HEIGHT;

function getCardImageHeight(cardHeight: number): number {
  if (cardHeight <= 0) return 0;

  const byRatio = Math.round(cardHeight * IMAGE_HEIGHT_RATIO);
  const byTextBudget = cardHeight - TEXT_BLOCK_MIN_HEIGHT;
  const budgeted = Math.min(IMAGE_HEIGHT_MAX, byRatio, byTextBudget);

  if (budgeted >= HERO_IMAGE_MIN_HEIGHT) return budgeted;

  const minCardForHero = HERO_IMAGE_MIN_HEIGHT + 24;
  if (cardHeight >= minCardForHero) {
    return Math.min(IMAGE_HEIGHT_MAX, HERO_IMAGE_MIN_HEIGHT, byRatio);
  }

  return Math.max(0, budgeted);
}

const SUBSCRIPTION_BADGE_LABEL = 'May need subscription';
const SUBSCRIPTION_BADGE_SHORT_LABEL = 'May need sub';

function MatchReasonText({ reasons }: { reasons: string[] }) {
  const { colors } = useTheme();
  if (reasons.length === 0) return null;

  return (
    <Text
      style={[styles.matchReasonText, { color: colors.accent }]}
      numberOfLines={1}
      accessibilityRole="text">
      {reasons.join(' · ')}
    </Text>
  );
}

function SubscriptionBadge({ compact }: { compact?: boolean }) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.subBadge,
        compact && styles.subBadgeCompact,
        { backgroundColor: colors.accentMuted },
      ]}
      accessibilityRole="text"
      accessibilityLabel={SUBSCRIPTION_BADGE_LABEL}>
      <Ionicons name="lock-closed" size={compact ? 12 : 13} color={colors.accent} />
      <Text
        style={[
          styles.subBadgeText,
          compact && styles.subBadgeTextCompact,
          { color: colors.accent },
        ]}>
        {compact ? SUBSCRIPTION_BADGE_SHORT_LABEL : SUBSCRIPTION_BADGE_LABEL}
      </Text>
    </View>
  );
}

function StoryLikeButton({ article }: { article: Article }) {
  const { colors } = useTheme();
  const { isLiked, toggleLike } = usePreferences();
  const liked = isLiked(article.id);
  const [showFolderPicker, setShowFolderPicker] = useState(false);

  function handleLike() {
    toggleLike(article);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }

  return (
    <>
      <Pressable
        onPress={handleLike}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={liked ? 'Unlike article' : 'Like article'}
        style={({ pressed }) => [styles.storyLikeButton, pressed && styles.pressed]}>
        <Ionicons
          name={liked ? 'heart' : 'heart-outline'}
          size={26}
          color={liked ? colors.accent : colors.textSecondary}
        />
      </Pressable>
      {liked ? (
        <Pressable
          onPress={() => setShowFolderPicker(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Add to folder"
          style={({ pressed }) => [styles.storyLikeButton, pressed && styles.pressed]}>
          <Ionicons name="folder-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      ) : null}
      <FolderPickerModal
        visible={showFolderPicker}
        articleId={article.id}
        onClose={() => setShowFolderPicker(false)}
      />
    </>
  );
}

function StoryCard({
  article,
  variant,
  matchReasons,
  onFeedClick,
}: {
  article: Article;
  variant: 'story' | 'storyLead';
  matchReasons?: string[];
  onFeedClick?: (article: Article) => void;
}) {
  const { colors } = useTheme();
  const isLead = variant === 'storyLead';
  const hasMatchReasons = (matchReasons?.length ?? 0) > 0;
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    void openFeedArticle(article, { onFeedClick });
  }

  return (
    <View style={[styles.storyCard, { backgroundColor: colors.background }]}>
      <Pressable
        onPressIn={() => warmArticleOpen(article)}
        onPress={openArticle}
        accessibilityRole="button"
        accessibilityLabel={`Open ${article.title}`}
        style={({ pressed }) => [styles.storyImagePressable, pressed && styles.pressed]}>
        {isLead ? (
          <FoldedImage
            uri={article.imageUrl}
            recyclingKey={article.id}
            source={article.source}
            sourceLogo={article.sourceLogo}
            style={[styles.storyImageWrap, { aspectRatio: STORY_CARD_LEAD_IMAGE_ASPECT }]}
          />
        ) : (
          <View style={[styles.storyImageWrap, { aspectRatio: STORY_CARD_IMAGE_ASPECT }]}>
            <ArticleImage
              uri={article.imageUrl}
              recyclingKey={article.id}
              style={styles.image}
              source={article.source}
              sourceLogo={article.sourceLogo}
            />
          </View>
        )}
      </Pressable>

      <View style={styles.storyBody}>
        {isLead ? (
          <Text style={[styles.kickerText, { color: colors.accent }]} numberOfLines={1}>
            {articleKicker(article)}
          </Text>
        ) : null}

        {hasMatchReasons ? (
          <View style={styles.storyMatchReasons}>
            <MatchReasonText reasons={matchReasons!} />
          </View>
        ) : null}

        <View style={styles.storyMetaRow}>
          <View style={styles.storyMetaSource}>
            <ArticleSourceMenu article={article} />
          </View>
          <View style={styles.metaEnd}>
            {requiresSubscription ? <SubscriptionBadge compact /> : null}
            <Text style={[styles.storyMeta, { color: colors.textSecondary }]}>
              {formatDate(article.publishedAt)}
            </Text>
            <StoryLikeButton article={article} />
          </View>
        </View>

        <Pressable
          onPressIn={() => warmArticleOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Open ${article.title}`}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <Text
            style={[
              styles.storyTitle,
              isLead ? styles.storyTitleLead : styles.storyTitleDefault,
              { color: colors.text },
            ]}
            numberOfLines={isLead ? 4 : 3}
            ellipsizeMode="tail">
            {article.title}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 2-up grid tile: fast scan — small photo, kicker, headline. No excerpt, no like button. */
function StoryGridCard({ article, onFeedClick }: { article: Article; onFeedClick?: (article: Article) => void }) {
  const { colors } = useTheme();
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    void openFeedArticle(article, { onFeedClick });
  }

  return (
    <View style={styles.gridCard}>
      <Pressable
        onPressIn={() => warmArticleOpen(article)}
        onPress={openArticle}
        accessibilityRole="button"
        accessibilityLabel={`Open ${article.title}`}
        style={({ pressed }) => [pressed && styles.pressed]}>
        <FoldedImage
          uri={article.imageUrl}
          recyclingKey={article.id}
          source={article.source}
          sourceLogo={article.sourceLogo}
          style={[styles.gridImageWrap, { aspectRatio: FOLD_GRID_IMAGE_ASPECT }]}
        />
        {requiresSubscription ? (
          <View style={styles.gridSubBadge} pointerEvents="none">
            <SubscriptionBadge compact />
          </View>
        ) : null}
      </Pressable>

      <View style={styles.gridBody}>
        <Text style={[styles.kickerText, { color: colors.accent }]} numberOfLines={1}>
          {articleKicker(article)}
        </Text>
        <Pressable
          onPressIn={() => warmArticleOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Open ${article.title}`}
          style={({ pressed }) => [pressed && styles.pressed]}>
          <Text
            style={[styles.storyTitle, styles.storyTitleGrid, { color: colors.text }]}
            numberOfLines={3}
            ellipsizeMode="tail">
            {article.title}
          </Text>
        </Pressable>
        <Text style={[styles.gridSource, { color: colors.textSecondary }]} numberOfLines={1}>
          {article.source}
        </Text>
      </View>
    </View>
  );
}

/** Image-left, text-right row: the full width goes to the headline instead of fighting a neighbor. */
function StoryRowCard({ article, onFeedClick }: { article: Article; onFeedClick?: (article: Article) => void }) {
  const { colors } = useTheme();
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    void openFeedArticle(article, { onFeedClick });
  }

  return (
    <Pressable
      onPressIn={() => warmArticleOpen(article)}
      onPress={openArticle}
      accessibilityRole="button"
      accessibilityLabel={`Open ${article.title}`}
      style={({ pressed }) => [styles.rowCard, pressed && styles.pressed]}>
      <FoldedImage
        uri={article.imageUrl}
        recyclingKey={article.id}
        source={article.source}
        sourceLogo={article.sourceLogo}
        style={styles.rowImageWrap}
      />
      <View style={styles.rowBody}>
        <Text style={[styles.kickerText, { color: colors.accent }]} numberOfLines={1}>
          {articleKicker(article)}
        </Text>
        <Text
          style={[styles.storyTitle, styles.storyTitleRow, { color: colors.text }]}
          numberOfLines={3}
          ellipsizeMode="tail">
          {article.title}
        </Text>
        <View style={styles.rowMetaRow}>
          <Text style={[styles.rowSource, { color: colors.textSecondary }]} numberOfLines={1}>
            {article.source}
          </Text>
          {requiresSubscription ? <SubscriptionBadge compact /> : null}
        </View>
      </View>
    </Pressable>
  );
}

/** Full-viewport snap page: large image + quiet meta/title, room for the bottom peek vignette. */
function StoryPageCard({
  article,
  height,
  matchReasons,
  onFeedClick,
}: {
  article: Article;
  height: number;
  matchReasons?: string[];
  onFeedClick?: (article: Article) => void;
}) {
  const { colors } = useTheme();
  const hasMatchReasons = (matchReasons?.length ?? 0) > 0;
  const requiresSubscription = article.requiresSubscription === true;
  const imageHeight = Math.max(
    HERO_IMAGE_MIN_HEIGHT,
    Math.round(height * 0.58),
  );

  function openArticle() {
    void openFeedArticle(article, { onFeedClick });
  }

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <Pressable
        onPressIn={() => warmArticleOpen(article)}
        onPress={openArticle}
        accessibilityRole="button"
        accessibilityLabel={`Open ${article.title}`}
        style={({ pressed }) => [styles.storyPageImagePressable, pressed && styles.pressed]}>
        <View style={[styles.storyImageWrap, { height: imageHeight }]}>
          <ArticleImage
            uri={article.imageUrl}
            recyclingKey={article.id}
            style={styles.image}
            source={article.source}
            sourceLogo={article.sourceLogo}
          />
          {requiresSubscription ? (
            <View style={styles.storyPageSubBadge} pointerEvents="none">
              <SubscriptionBadge />
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={[styles.storyPageBody, { paddingBottom: VIGNETTE_TEXT_CLEARANCE + 8 }]}>
        {hasMatchReasons ? (
          <View style={styles.storyMatchReasons}>
            <MatchReasonText reasons={matchReasons!} />
          </View>
        ) : null}

        <View style={styles.storyMetaRow}>
          <View style={styles.storyMetaSource}>
            <ArticleSourceMenu article={article} />
          </View>
          <View style={styles.metaEnd}>
            <Text style={[styles.storyMeta, { color: colors.textSecondary }]}>
              {formatDate(article.publishedAt)}
            </Text>
            <StoryLikeButton article={article} />
          </View>
        </View>

        <Pressable
          onPressIn={() => warmArticleOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Open ${article.title}`}
          style={({ pressed }) => [styles.storyPageTitlePressable, pressed && styles.pressed]}>
          <Text
            style={[styles.storyTitle, styles.storyTitlePage, { color: colors.text }]}
            numberOfLines={4}
            ellipsizeMode="tail">
            {article.title}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function matchReasonsKey(reasons?: string[]) {
  return reasons?.join('\0') ?? '';
}

function areArticleCardPropsEqual(prev: ArticleCardProps, next: ArticleCardProps) {
  return (
    prev.article.id === next.article.id &&
    prev.article.title === next.article.title &&
    prev.article.excerpt === next.article.excerpt &&
    prev.article.imageUrl === next.article.imageUrl &&
    prev.article.publishedAt === next.article.publishedAt &&
    prev.article.source === next.article.source &&
    prev.article.sourceLogo === next.article.sourceLogo &&
    prev.article.url === next.article.url &&
    prev.article.requiresSubscription === next.article.requiresSubscription &&
    prev.article.topics.join('\0') === next.article.topics.join('\0') &&
    prev.height === next.height &&
    prev.variant === next.variant &&
    matchReasonsKey(prev.matchReasons) === matchReasonsKey(next.matchReasons) &&
    prev.onFeedClick === next.onFeedClick
  );
}

export const ArticleCard = memo(function ArticleCard({
  article,
  height = 0,
  variant = 'default',
  matchReasons,
  onFeedClick,
}: ArticleCardProps) {
  if (variant === 'story' || variant === 'storyLead') {
    return (
      <StoryCard
        article={article}
        variant={variant}
        matchReasons={matchReasons}
        onFeedClick={onFeedClick}
      />
    );
  }

  if (variant === 'storyPage') {
    return (
      <StoryPageCard
        article={article}
        height={height}
        matchReasons={matchReasons}
        onFeedClick={onFeedClick}
      />
    );
  }

  if (variant === 'storyGrid') {
    return <StoryGridCard article={article} onFeedClick={onFeedClick} />;
  }

  if (variant === 'storyRow') {
    return <StoryRowCard article={article} onFeedClick={onFeedClick} />;
  }

  const { colors } = useTheme();
  const imageHeight = getCardImageHeight(height);
  const heroVignetteHeight = Math.round(imageHeight * ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO);
  const hasExcerpt = article.excerpt.length > 0;
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    void openFeedArticle(article, { onFeedClick });
  }

  const hasMatchReasons = (matchReasons?.length ?? 0) > 0;

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {hasMatchReasons ? (
          <View style={styles.matchReasonsAboveImage}>
            <MatchReasonText reasons={matchReasons!} />
          </View>
        ) : null}
        <Pressable
          onPressIn={() => warmArticleOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Open ${article.title}`}
          style={({ pressed }) => [styles.heroPressable, pressed && styles.pressed]}>
          <View style={[styles.imageWrap, { height: imageHeight }]}>
            <ArticleImage
              uri={article.imageUrl}
              recyclingKey={article.id}
              style={styles.image}
              source={article.source}
              sourceLogo={article.sourceLogo}
            />
            <LinearGradient
              colors={[
                withAlpha(colors.background, 0),
                withAlpha(colors.background, 0),
                withAlpha(colors.background, 0.75),
                colors.background,
              ]}
              locations={[...ARTICLE_CARD_HERO_VIGNETTE_GRADIENT_LOCATIONS]}
              style={[styles.imageGradient, { height: heroVignetteHeight }]}
            />
          </View>
        </Pressable>

        <View style={[styles.textBlock, { paddingBottom: VIGNETTE_TEXT_CLEARANCE }]}>
          <View style={styles.metaRow}>
            <View style={styles.metaSource}>
              <ArticleSourceMenu article={article} />
            </View>
            <View style={styles.metaEnd}>
              {requiresSubscription ? <SubscriptionBadge /> : null}
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {formatDate(article.publishedAt)}
              </Text>
            </View>
          </View>

          <Pressable
            onPressIn={() => warmArticleOpen(article)}
            onPress={openArticle}
            accessibilityRole="button"
            accessibilityLabel={`Open ${article.title}`}
            style={({ pressed }) => [styles.tappable, pressed && styles.pressed]}>
            {article.topics.length > 0 ? (
              <View style={styles.topics}>
                {article.topics.map((topic) => (
                  <View key={topic} style={[styles.topicPill, { backgroundColor: colors.border }]}>
                    <Text style={[styles.topicText, { color: colors.textSecondary }]}>
                      {CURIOSITY_LABELS[topic]}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.titleRegion}>
              <Text style={[styles.title, { color: colors.text }]}>{article.title}</Text>
            </View>

            {hasExcerpt ? (
              <View style={styles.excerptSlot}>
                <Text
                  style={[styles.excerpt, { color: colors.textSecondary }]}
                  numberOfLines={EXCERPT_LINES}
                  ellipsizeMode="tail"
                  allowFontScaling={false}>
                  {article.excerpt}
                </Text>
              </View>
            ) : null}

            <View style={styles.textBlockSpacer} />

            <Text style={[styles.readMore, { color: colors.accent }]}>Open article</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}, areArticleCardPropsEqual);

const styles = StyleSheet.create({
  card: {
    width: '100%',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
  tappable: {
    flex: 1,
    minHeight: 0,
  },
  heroPressable: {
    flexShrink: 0,
  },
  pressed: {
    opacity: 0.92,
  },
  imageWrap: {
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  imageGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  textBlock: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 24,
    paddingTop: 6,
  },
  titleRegion: {
    flexShrink: 0,
  },
  textBlockSpacer: {
    flex: 1,
    minHeight: 0,
  },
  excerptSlot: {
    minHeight: EXCERPT_SLOT_HEIGHT,
    marginTop: 4,
    flexShrink: 0,
    justifyContent: 'flex-start',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    flexShrink: 0,
    gap: 8,
  },
  metaSource: {
    flex: 1,
    minWidth: 0,
  },
  metaEnd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  subBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  subBadgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  subBadgeText: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    letterSpacing: 0.15,
  },
  subBadgeTextCompact: {
    fontSize: 11,
  },
  storyPageSubBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 3,
  },
  meta: {
    fontFamily: 'Inter',
    fontSize: 12,
    flexShrink: 0,
  },
  title: {
    fontFamily: 'LoraBold',
    fontSize: 24,
    lineHeight: TITLE_LINE_HEIGHT,
    letterSpacing: -0.3,
  },
  excerpt: {
    fontFamily: 'Inter',
    fontSize: EXCERPT_FONT_SIZE,
    lineHeight: EXCERPT_LINE_HEIGHT,
    minHeight: EXCERPT_SLOT_HEIGHT,
    flexShrink: 0,
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'top' as const } : {}),
  },
  topics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
    maxHeight: 48,
    overflow: 'hidden',
    flexShrink: 0,
  },
  topicPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  topicText: {
    fontFamily: 'InterMedium',
    fontSize: 11,
  },
  matchReasonsAboveImage: {
    paddingHorizontal: 24,
    paddingTop: 4,
    paddingBottom: 4,
    flexShrink: 0,
  },
  matchReasonText: {
    fontFamily: 'InterMedium',
    fontSize: 12,
    letterSpacing: 0.15,
  },
  readMore: {
    flexShrink: 0,
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: READ_MORE_LINE_HEIGHT,
    marginTop: 4,
  },
  storyCard: {
    width: '100%',
    paddingBottom: 28,
  },
  storyImagePressable: {
    width: '100%',
  },
  storyImageWrap: {
    width: '100%',
    overflow: 'hidden',
    backgroundColor: '#1A1A1A',
  },
  storyBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 8,
  },
  storyMatchReasons: {
    marginBottom: 2,
  },
  storyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  storyMetaSource: {
    flex: 1,
    minWidth: 0,
  },
  storyMeta: {
    fontFamily: 'InterMedium',
    fontSize: 14,
    flexShrink: 0,
  },
  storyLikeButton: {
    padding: 4,
  },
  storyTitle: {
    fontFamily: 'LoraBold',
    letterSpacing: -0.35,
  },
  storyTitleLead: {
    fontSize: 24,
    lineHeight: 30,
  },
  storyTitleDefault: {
    fontSize: 19,
    lineHeight: 25,
  },
  storyTitlePage: {
    fontSize: 26,
    lineHeight: 32,
  },
  storyPageImagePressable: {
    width: '100%',
    flexShrink: 0,
  },
  storyPageBody: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 10,
  },
  storyPageTitlePressable: {
    flexShrink: 1,
  },
  gridCard: {
    flex: 1,
    minWidth: 0,
  },
  gridImageWrap: {
    width: '100%',
    backgroundColor: '#1A1A1A',
  },
  gridSubBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 2,
  },
  gridBody: {
    paddingTop: 8,
    gap: 3,
  },
  gridSource: {
    fontFamily: 'Inter',
    fontSize: 11,
  },
  kickerText: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  storyTitleGrid: {
    fontSize: 15,
    lineHeight: 19,
  },
  rowCard: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  rowImageWrap: {
    width: FOLD_ROW_IMAGE_SIZE,
    height: FOLD_ROW_IMAGE_SIZE,
    flexShrink: 0,
    backgroundColor: '#1A1A1A',
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  rowMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowSource: {
    fontFamily: 'InterMedium',
    fontSize: 12,
    flexShrink: 1,
  },
  storyTitleRow: {
    fontSize: 17,
    lineHeight: 22,
  },
});
