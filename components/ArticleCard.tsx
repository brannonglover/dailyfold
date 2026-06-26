import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { memo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { ArticleSourceMenu } from '@/components/ArticleSourceMenu';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import {
  ARTICLE_CARD_HERO_VIGNETTE_GRADIENT_LOCATIONS,
  ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO,
  FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT,
} from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { rememberOpenArticle } from '@/services/articleSession';
import { prefetchArticleReaderContent, seedReaderContentFromArticle } from '@/services/articleContent';
import { Article } from '@/types';

function warmArticleForOpen(article: Article) {
  rememberOpenArticle(article);
  seedReaderContentFromArticle(article);
  prefetchArticleReaderContent(article.id, article);
}

function navigateToArticle(
  article: Article,
  router: ReturnType<typeof useRouter>,
  onFeedClick?: (article: Article) => void,
) {
  rememberOpenArticle(article);
  router.push(`/article/${article.id}`);
  queueMicrotask(() => {
    seedReaderContentFromArticle(article);
    prefetchArticleReaderContent(article.id, article);
    onFeedClick?.(article);
  });
}

type ArticleCardVariant = 'default' | 'hero' | 'compact' | 'featured';

interface ArticleCardProps {
  article: Article;
  height: number;
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

const IMAGE_HEIGHT_MAX = 220;
const IMAGE_HEIGHT_RATIO = 0.32;
/** Never collapse the hero to 0 on short cards (common on physical devices with more chrome). */
const HERO_IMAGE_MIN_HEIGHT = 120;
/** Space reserved above the hero when match-reason text is shown. */
const MATCH_REASON_STRIP_HEIGHT = 28;

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

const OVERLAY_TITLE_COLOR = '#FFFFFF';
const OVERLAY_META_COLOR = 'rgba(255,255,255,0.92)';
const OVERLAY_TEXT_SHADOW = {
  textShadowColor: 'rgba(0,0,0,0.75)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
} as const;
/** Narrow bottom feather for compact/featured only — hero relies on the text panel. */
const NEWSPAPER_OVERLAY_SCRIM_HEIGHT_RATIO = 0.28;
const NEWSPAPER_OVERLAY_SCRIM_COLORS = [
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0)',
  'rgba(0,0,0,0.1)',
  'rgba(0,0,0,0.3)',
] as const;
const NEWSPAPER_OVERLAY_SCRIM_LOCATIONS = [0, 0.45, 0.78, 1] as const;
/** Localized scrim behind meta + title — keeps the rest of the hero unobstructed. */
const SUBSCRIPTION_BADGE_LABEL = 'May need subscription';

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

function SubscriptionBadge({
  compact,
  tone = 'default',
}: {
  compact?: boolean;
  tone?: 'default' | 'onImage';
}) {
  const { colors } = useTheme();
  const onImage = tone === 'onImage';

  if (compact) {
    return (
      <View
        style={onImage ? styles.newspaperSubIconBadge : [styles.subIconBadge, { backgroundColor: colors.border }]}
        accessibilityRole="image"
        accessibilityLabel={SUBSCRIPTION_BADGE_LABEL}>
        <Ionicons
          name="lock-closed-outline"
          size={12}
          color={onImage ? OVERLAY_META_COLOR : colors.textSecondary}
        />
      </View>
    );
  }

  if (onImage) {
    return (
      <View style={styles.newspaperSubBadge} accessibilityRole="text">
        <Text style={styles.newspaperSubBadgeText}>{SUBSCRIPTION_BADGE_LABEL}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.subBadge, { backgroundColor: colors.border }]} accessibilityRole="text">
      <Text style={[styles.subBadgeText, { color: colors.textSecondary }]}>{SUBSCRIPTION_BADGE_LABEL}</Text>
    </View>
  );
}

const NEWSPAPER_TEXT_PANEL_GRADIENT = {
  hero: {
    colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.52)', 'rgba(0,0,0,0.68)'] as const,
    locations: [0, 0.32, 1] as const,
  },
  featured: {
    colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.46)', 'rgba(0,0,0,0.58)'] as const,
    locations: [0, 0.3, 1] as const,
  },
  compact: {
    colors: ['rgba(0,0,0,0)', 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0.52)'] as const,
    locations: [0, 0.28, 1] as const,
  },
} as const;

function NewspaperOverlayCard({
  article,
  height,
  variant,
  matchReasons,
  onFeedClick,
}: {
  article: Article;
  height: number;
  variant: 'hero' | 'compact' | 'featured';
  matchReasons?: string[];
  onFeedClick?: (article: Article) => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const hasMatchReasons = (matchReasons?.length ?? 0) > 0;
  const matchReasonStripHeight = hasMatchReasons ? MATCH_REASON_STRIP_HEIGHT : 0;
  const imageHeight = height - matchReasonStripHeight;
  const isHero = variant === 'hero';
  const isFeatured = variant === 'featured';
  const isCompact = variant === 'compact';
  const requiresSubscription = article.requiresSubscription === true;
  const scrimHeight = Math.round(imageHeight * NEWSPAPER_OVERLAY_SCRIM_HEIGHT_RATIO);
  const textPanelGradient = NEWSPAPER_TEXT_PANEL_GRADIENT[variant];

  function openArticle() {
    navigateToArticle(article, router, onFeedClick);
  }

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      {hasMatchReasons ? (
        <View
          style={[
            styles.matchReasonsAboveImage,
            isCompact
              ? styles.matchReasonsAboveImageCompact
              : styles.matchReasonsAboveImageNewspaper,
          ]}>
          <MatchReasonText reasons={matchReasons!} />
        </View>
      ) : null}
      <View style={[styles.newspaperImageWrap, { height: imageHeight }]}>
        <Pressable
          onPressIn={() => warmArticleForOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Read ${article.title}`}
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed && styles.pressed]}>
          <ArticleImage
            uri={article.imageUrl}
            recyclingKey={article.id}
            style={styles.image}
            source={article.source}
            sourceLogo={article.sourceLogo}
            compact={!isHero && !isFeatured}
          />
        </Pressable>
        {!isHero ? (
          <LinearGradient
            colors={[...NEWSPAPER_OVERLAY_SCRIM_COLORS]}
            locations={[...NEWSPAPER_OVERLAY_SCRIM_LOCATIONS]}
            style={[styles.newspaperScrim, { height: scrimHeight }]}
            pointerEvents="none"
          />
        ) : null}
        <View style={styles.newspaperOverlay} pointerEvents="box-none">
          <LinearGradient
            colors={[...textPanelGradient.colors]}
            locations={[...textPanelGradient.locations]}
            pointerEvents="box-none"
            style={[
              styles.newspaperTextPanel,
              isHero
                ? styles.newspaperTextPanelHero
                : isFeatured
                  ? styles.newspaperTextPanelFeatured
                  : styles.newspaperTextPanelCompact,
            ]}>
            <View style={styles.newspaperMetaRow} pointerEvents="box-none">
              <View style={styles.newspaperMetaSource} pointerEvents="auto">
                <ArticleSourceMenu article={article} tone="onImage" />
              </View>
              <View style={styles.metaEnd} pointerEvents="none">
                {requiresSubscription ? (
                  <SubscriptionBadge compact={isCompact} tone="onImage" />
                ) : null}
                <Text style={styles.newspaperMeta}>{formatDate(article.publishedAt)}</Text>
              </View>
            </View>
            <Pressable
              onPressIn={() => warmArticleForOpen(article)}
              onPress={openArticle}
              accessibilityRole="button"
              accessibilityLabel={`Read ${article.title}`}
              style={({ pressed }) => [styles.newspaperTitlePressable, pressed && styles.pressed]}>
              <Text
                style={[
                  styles.newspaperTitle,
                  isHero
                    ? styles.newspaperTitleHero
                    : isFeatured
                      ? styles.newspaperTitleFeatured
                      : styles.newspaperTitleCompact,
                ]}
                numberOfLines={isHero ? 4 : isFeatured ? 4 : 3}
                ellipsizeMode="tail">
                {article.title}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>
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
  height,
  variant = 'default',
  matchReasons,
  onFeedClick,
}: ArticleCardProps) {
  if (variant === 'hero' || variant === 'compact' || variant === 'featured') {
    return (
      <NewspaperOverlayCard
        article={article}
        height={height}
        variant={variant}
        matchReasons={matchReasons}
        onFeedClick={onFeedClick}
      />
    );
  }

  const { colors } = useTheme();
  const router = useRouter();
  const imageHeight = getCardImageHeight(height);
  const heroVignetteHeight = Math.round(imageHeight * ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO);
  const hasExcerpt = article.excerpt.length > 0;
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    navigateToArticle(article, router, onFeedClick);
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
          onPressIn={() => warmArticleForOpen(article)}
          onPress={openArticle}
          accessibilityRole="button"
          accessibilityLabel={`Read ${article.title}`}
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
            onPressIn={() => warmArticleForOpen(article)}
            onPress={openArticle}
            accessibilityRole="button"
            accessibilityLabel={`Read ${article.title}`}
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

            <Text style={[styles.readMore, { color: colors.accent }]}>Continue reading</Text>
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
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  subIconBadge: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 999,
  },
  subBadgeText: {
    fontFamily: 'InterMedium',
    fontSize: 10,
    letterSpacing: 0.2,
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
  matchReasonsAboveImageNewspaper: {
    paddingHorizontal: 14,
  },
  matchReasonsAboveImageCompact: {
    paddingHorizontal: 12,
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
  newspaperImageWrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  newspaperScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  newspaperOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  newspaperTitlePressable: {
    width: '100%',
  },
  newspaperTextPanel: {
    width: '100%',
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 14,
  },
  newspaperTextPanelHero: {
    paddingTop: 22,
    paddingBottom: 16,
  },
  newspaperTextPanelFeatured: {
    paddingTop: 18,
    paddingBottom: 14,
  },
  newspaperTextPanelCompact: {
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  newspaperMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  newspaperMetaSource: {
    flex: 1,
    minWidth: 0,
  },
  newspaperMeta: {
    fontFamily: 'Inter',
    fontSize: 11,
    color: OVERLAY_META_COLOR,
    flexShrink: 0,
    ...OVERLAY_TEXT_SHADOW,
  },
  newspaperSubBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  newspaperSubIconBadge: {
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  newspaperSubBadgeText: {
    fontFamily: 'InterMedium',
    fontSize: 10,
    letterSpacing: 0.2,
    color: OVERLAY_META_COLOR,
    ...OVERLAY_TEXT_SHADOW,
  },
  newspaperTitle: {
    fontFamily: 'LoraBold',
    color: OVERLAY_TITLE_COLOR,
    letterSpacing: -0.3,
    flexShrink: 0,
    ...OVERLAY_TEXT_SHADOW,
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowRadius: 8,
  },
  newspaperTitleHero: {
    fontSize: 26,
    lineHeight: 32,
  },
  newspaperTitleCompact: {
    fontSize: 15,
    lineHeight: 19,
  },
  newspaperTitleFeatured: {
    fontSize: 20,
    lineHeight: 26,
  },
});
