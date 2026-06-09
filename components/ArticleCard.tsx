import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ArticleImage } from '@/components/ArticleImage';
import { ArticleSourceMenu } from '@/components/ArticleSourceMenu';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import {
  ARTICLE_CARD_HERO_VIGNETTE_GRADIENT_LOCATIONS,
  ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO,
  FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT,
  TAB_BAR_HEIGHT,
} from '@/constants/Layout';
import { useTheme } from '@/hooks/useTheme';
import { rememberOpenArticle } from '@/services/articleSession';
import { Article } from '@/types';

type ArticleCardVariant = 'default' | 'hero' | 'compact' | 'featured';

interface ArticleCardProps {
  article: Article;
  height: number;
  variant?: ArticleCardVariant;
  /** When false, taps are ignored (e.g. user just scrolled the feed). */
  allowPress?: () => boolean;
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
  allowPress,
}: {
  article: Article;
  height: number;
  variant: 'hero' | 'compact' | 'featured';
  allowPress?: () => boolean;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const imageHeight = height;
  const isHero = variant === 'hero';
  const isFeatured = variant === 'featured';
  const requiresSubscription = article.requiresSubscription === true;
  const scrimHeight = Math.round(imageHeight * NEWSPAPER_OVERLAY_SCRIM_HEIGHT_RATIO);
  const textPanelGradient = NEWSPAPER_TEXT_PANEL_GRADIENT[variant];

  function openArticle() {
    if (allowPress && !allowPress()) return;
    rememberOpenArticle(article);
    router.push(`/article/${article.id}`);
  }

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <View style={[styles.newspaperImageWrap, { height: imageHeight }]}>
        <Pressable
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
        <View
          style={[
            styles.newspaperOverlay,
            isHero
              ? styles.newspaperOverlayHero
              : isFeatured
                ? styles.newspaperOverlayFeatured
                : styles.newspaperOverlayCompact,
          ]}
          pointerEvents="box-none">
          <Pressable
            onPress={openArticle}
            accessibilityRole="button"
            accessibilityLabel={`Read ${article.title}`}
            style={({ pressed }) => [pressed && styles.pressed]}>
            <LinearGradient
              colors={[...textPanelGradient.colors]}
              locations={[...textPanelGradient.locations]}
              style={[
                styles.newspaperTextPanel,
                isHero
                  ? styles.newspaperTextPanelHero
                  : isFeatured
                    ? styles.newspaperTextPanelFeatured
                    : styles.newspaperTextPanelCompact,
              ]}>
              <View style={styles.newspaperMetaRow}>
                <ArticleSourceMenu article={article} bottomOffset={TAB_BAR_HEIGHT} tone="onImage" />
                <View style={styles.metaEnd}>
                  {requiresSubscription ? (
                    <View style={styles.newspaperSubBadge}>
                      <Text style={styles.newspaperSubBadgeText}>May need subscription</Text>
                    </View>
                  ) : null}
                  <Text style={styles.newspaperMeta}>{formatDate(article.publishedAt)}</Text>
                </View>
              </View>
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
            </LinearGradient>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ArticleCard({ article, height, variant = 'default', allowPress }: ArticleCardProps) {
  if (variant === 'hero' || variant === 'compact' || variant === 'featured') {
    return (
      <NewspaperOverlayCard article={article} height={height} variant={variant} allowPress={allowPress} />
    );
  }

  const { colors } = useTheme();
  const router = useRouter();
  const imageHeight = getCardImageHeight(height);
  const heroVignetteHeight = Math.round(imageHeight * ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO);
  const hasExcerpt = article.excerpt.length > 0;
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    if (allowPress && !allowPress()) return;
    rememberOpenArticle(article);
    router.push(`/article/${article.id}`);
  }

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Pressable
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
            <ArticleSourceMenu article={article} bottomOffset={TAB_BAR_HEIGHT} />
            <View style={styles.metaEnd}>
              {requiresSubscription ? (
                <View style={[styles.subBadge, { backgroundColor: colors.border }]}>
                  <Text style={[styles.subBadgeText, { color: colors.textSecondary }]}>
                    May need subscription
                  </Text>
                </View>
              ) : null}
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {formatDate(article.publishedAt)}
              </Text>
            </View>
          </View>

          <Pressable
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
}

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
    paddingHorizontal: 20,
  },
  newspaperOverlayHero: {
    paddingBottom: 16,
  },
  newspaperOverlayCompact: {
    paddingBottom: 12,
    paddingHorizontal: 12,
  },
  newspaperOverlayFeatured: {
    paddingBottom: 14,
    paddingHorizontal: 20,
  },
  newspaperTextPanel: {
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 18,
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
    borderRadius: 8,
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
