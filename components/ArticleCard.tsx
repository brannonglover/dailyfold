import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { ArticleActions } from '@/components/ArticleActions';
import { ArticleImage } from '@/components/ArticleImage';
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

interface ArticleCardProps {
  article: Article;
  height: number;
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
/** ArticleActions row (padding + buttons + icons) — keep in sync with ArticleActions styles */
const ACTIONS_BAR_HEIGHT = 70;
/** Keeps excerpt + CTA above the feed bottom vignette overlay */
const VIGNETTE_TEXT_CLEARANCE = Math.round(FEED_SCROLL_PERSISTENT_GRADIENT_HEIGHT * 0.4);
const EXCERPT_FONT_SIZE = 16;
const EXCERPT_LINE_HEIGHT = 24;
const EXCERPT_LINES = 2;
/** 48px theoretical; +4px so Inter’s ascenders don’t clip the second line in a fixed slot */
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
  const byTextBudget = cardHeight - ACTIONS_BAR_HEIGHT - TEXT_BLOCK_MIN_HEIGHT;
  const budgeted = Math.min(IMAGE_HEIGHT_MAX, byRatio, byTextBudget);

  if (budgeted >= HERO_IMAGE_MIN_HEIGHT) return budgeted;

  const minCardForHero = ACTIONS_BAR_HEIGHT + HERO_IMAGE_MIN_HEIGHT + 24;
  if (cardHeight >= minCardForHero) {
    return Math.min(IMAGE_HEIGHT_MAX, HERO_IMAGE_MIN_HEIGHT, byRatio);
  }

  return Math.max(0, budgeted);
}

export function ArticleCard({ article, height }: ArticleCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const imageHeight = getCardImageHeight(height);
  const heroVignetteHeight = Math.round(imageHeight * ARTICLE_CARD_HERO_VIGNETTE_HEIGHT_RATIO);
  const hasExcerpt = article.excerpt.length > 0;
  const requiresSubscription = article.requiresSubscription === true;

  function openArticle() {
    rememberOpenArticle(article);
    router.push(`/article/${article.id}`);
  }

  return (
    <View style={[styles.card, { height, backgroundColor: colors.background }]}>
      <Pressable
        onPress={openArticle}
        accessibilityRole="button"
        accessibilityLabel={`Read ${article.title}`}
        style={({ pressed }) => [styles.content, pressed && styles.pressed]}>
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

        <View style={[styles.textBlock, { paddingBottom: VIGNETTE_TEXT_CLEARANCE }]}>
          <View style={styles.metaRow}>
            <Text style={[styles.source, { color: colors.accent }]}>{article.source}</Text>
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
        </View>
      </Pressable>

      <ArticleActions article={article} modalBottomOffset={TAB_BAR_HEIGHT} />
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
  source: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
    flexShrink: 1,
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
});
