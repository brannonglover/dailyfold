import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArticleActions } from '@/components/ArticleActions';
import { ArticleImage } from '@/components/ArticleImage';
import { ArticleSourceMenu } from '@/components/ArticleSourceMenu';
import { ArticleVideoBlock } from '@/components/ArticleVideoBlock';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { SourceMenuHost } from '@/contexts/SourceMenuContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useOpenPublisherArticle } from '@/hooks/useOpenPublisherArticle';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchArticleReaderContent,
  getCachedReaderContent,
  resolveReaderContentForArticle,
  seedReaderContentFromArticle,
} from '@/services/articleContent';
import { ARTICLE_NO_IMAGE, isArticlePlaceholderImageUrl, resolveArticleImageUrl } from '@/constants/images';
import { Article } from '@/types';
import { ArticleReaderBlock, ArticleReaderContent } from '@/types/articleContent';
import { isUsableReaderParagraphText, resolveReaderBlockLayout } from '@/utils/articleParagraphs';

interface ArticleReaderProps {
  article: Article;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function ReaderBlockView({
  block,
  colors,
}: {
  block: ArticleReaderBlock;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadFailed(false);
  }, [block.type === 'image' ? block.url : block.type === 'video' ? block.url : null]);

  if (block.type === 'paragraph') {
    if (!isUsableReaderParagraphText(block.text)) return null;
    return (
      <Text style={[styles.paragraph, { color: colors.text }]}>
        {block.text}
      </Text>
    );
  }

  if (block.type === 'video') {
    return <ArticleVideoBlock block={block} colors={colors} />;
  }

  const uri = resolveArticleImageUrl(block.url);
  if (loadFailed || uri === ARTICLE_NO_IMAGE || isArticlePlaceholderImageUrl(uri)) {
    return null;
  }

  return (
    <View style={styles.inlineImageBlock}>
      <View style={[styles.inlineImageWrap, { backgroundColor: colors.surface }]}>
        <Image
          source={{ uri }}
          style={styles.inlineImage}
          contentFit="contain"
          transition={200}
          cachePolicy="memory-disk"
          accessibilityRole="image"
          accessibilityLabel={block.alt ?? block.caption ?? 'Article image'}
          onError={() => setLoadFailed(true)}
        />
      </View>
      {block.caption ? (
        <Text style={[styles.inlineImageCaption, { color: colors.textSecondary }]}>
          {block.caption}
        </Text>
      ) : null}
    </View>
  );
}

function PublisherLink({
  label,
  style,
  textStyle,
  onPress,
  isOpening,
  colors,
}: {
  label: string;
  style: object;
  textStyle: object;
  onPress: () => void;
  isOpening: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={isOpening}
      style={({ pressed }) => [style, (pressed || isOpening) && { opacity: 0.7 }]}
      accessibilityRole="link"
      accessibilityLabel={label}
      accessibilityState={{ busy: isOpening }}>
      {isOpening ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : (
        <Ionicons name="open-outline" size={14} color={colors.textSecondary} />
      )}
      <Text style={[textStyle, { color: colors.textSecondary }]}>
        {isOpening ? 'Opening…' : label}
      </Text>
    </Pressable>
  );
}

export function ArticleReader({ article }: ArticleReaderProps) {
  const { colors } = useTheme();
  const { recordArticleOpen } = usePreferences();
  const insets = useSafeAreaInsets();
  const requiresSubscription = article.requiresSubscription === true;
  const { open: openOnPublisher, isOpening: isOpeningPublisher, canOpen: canOpenOnPublisher } =
    useOpenPublisherArticle(article.url);
  const [readerContent, setReaderContent] = useState<ArticleReaderContent | null>(
    () => resolveReaderContentForArticle(article),
  );
  const [contentError, setContentError] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(
    () => resolveReaderContentForArticle(article) == null,
  );
  const activeContentArticleIdRef = useRef(article.id);
  const recordedOpenRef = useRef<string | null>(null);

  useEffect(() => {
    if (recordedOpenRef.current === article.id) return;
    recordedOpenRef.current = article.id;
    recordArticleOpen(article);
  }, [article, recordArticleOpen]);

  useEffect(() => {
    seedReaderContentFromArticle(article);
  }, [article]);

  useEffect(() => {
    let cancelled = false;
    const contentArticleId = article.id;
    activeContentArticleIdRef.current = contentArticleId;

    const preview = resolveReaderContentForArticle(article);
    const cached = getCachedReaderContent(contentArticleId) ?? preview;
    if (cached) {
      setReaderContent(cached);
      setContentError(false);
      setIsLoadingContent(false);
    } else {
      setIsLoadingContent(true);
      setContentError(false);
      setReaderContent(null);
    }

    fetchArticleReaderContent(contentArticleId)
      .then((content) => {
        if (cancelled || activeContentArticleIdRef.current !== contentArticleId) return;
        setReaderContent(content);
      })
      .catch(() => {
        if (cancelled || activeContentArticleIdRef.current !== contentArticleId) return;
        setContentError(true);
      })
      .finally(() => {
        if (cancelled || activeContentArticleIdRef.current !== contentArticleId) return;
        setIsLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article.id]);

  const extractedBlocks =
    readerContent?.source === 'extracted' && readerContent.blocks.length > 0
      ? readerContent.blocks
      : null;
  const { feedLede, bodyBlocks } = resolveReaderBlockLayout({
    article,
    extractedBlocks,
  });
  const showFeedLede = !!feedLede;
  const hasReadableBody = bodyBlocks.length > 0;
  const showLoadingBody = isLoadingContent && !hasReadableBody;
  const showExtractionInProgress = isLoadingContent && hasReadableBody;
  const showLoadMoreError = contentError && !isLoadingContent && !hasReadableBody;

  return (
    <SourceMenuHost>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
          keyboardShouldPersistTaps="handled"
          delaysContentTouches={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        alwaysBounceHorizontal={false}
        directionalLockEnabled
        bounces>
        <View style={styles.imageWrap}>
          <ArticleImage
            uri={article.imageUrl}
            style={styles.image}
            source={article.source}
            sourceLogo={article.sourceLogo}
          />
          <LinearGradient
            colors={['transparent', colors.background]}
            style={styles.imageGradient}
          />
        </View>

        <View style={styles.content}>
          <View style={styles.metaRow}>
            <ArticleSourceMenu article={article} />
            <Text style={[styles.meta, { color: colors.textSecondary }]}>
              {formatDate(article.publishedAt)}
            </Text>
          </View>

          <Text style={[styles.title, { color: colors.text }]}>{article.title}</Text>

          {requiresSubscription ? <SubscriptionBanner source={article.source} /> : null}

          <View style={styles.topics}>
            {article.topics.map((topic) => (
              <View key={topic} style={[styles.topicPill, { backgroundColor: colors.border }]}>
                <Text style={[styles.topicText, { color: colors.textSecondary }]}>{topic}</Text>
              </View>
            ))}
          </View>

          {canOpenOnPublisher ? (
            <PublisherLink
              label={`Open on ${article.source}`}
              style={styles.publisherLinkTop}
              textStyle={styles.publisherLinkTopText}
              onPress={openOnPublisher}
              isOpening={isOpeningPublisher}
              colors={colors}
            />
          ) : null}

          {showFeedLede && feedLede ? (
            <View
              style={[
                styles.feedLedeBox,
                { backgroundColor: colors.border, borderColor: colors.border },
              ]}
              accessibilityRole="text"
              accessibilityLabel="Feed preview. Not part of the article body.">
              <Text style={[styles.feedLedeLabel, { color: colors.textSecondary }]}>
                Feed preview
              </Text>
              <Text style={[styles.feedLedeText, { color: colors.textSecondary }]}>
                {feedLede}
              </Text>
            </View>
          ) : null}

          {bodyBlocks.map((block, index) => (
            <ReaderBlockView
              key={`${block.type}:${index}`}
              block={block}
              colors={colors}
            />
          ))}

          {showLoadingBody ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading article…
              </Text>
            </View>
          ) : null}

          {showExtractionInProgress ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                {`Loading more from ${article.source}…`}
              </Text>
            </View>
          ) : null}

          {showLoadMoreError ? (
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              We couldn't load more of this article in the app.
            </Text>
          ) : null}

          {canOpenOnPublisher ? (
            <PublisherLink
              label={`View full article on ${article.source}`}
              style={styles.publisherLink}
              textStyle={styles.publisherLinkText}
              onPress={openOnPublisher}
              isOpening={isOpeningPublisher}
              colors={colors}
            />
          ) : null}
        </View>
      </ScrollView>

        <ArticleActions article={article} />
      </View>
    </SourceMenuHost>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    width: '100%',
  },
  imageWrap: {
    height: 280,
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
    height: 100,
  },
  content: {
    width: '100%',
    maxWidth: '100%',
    paddingHorizontal: 24,
    paddingTop: 8,
    overflow: 'hidden',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 12,
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
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.4,
    marginBottom: 16,
  },
  topics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  publisherLinkTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  publisherLinkTopText: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
  },
  topicPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  topicText: {
    fontFamily: 'InterMedium',
    fontSize: 11,
    textTransform: 'capitalize',
  },
  feedLedeBox: {
    padding: 14,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 24,
    gap: 6,
  },
  feedLedeLabel: {
    fontFamily: 'InterMedium',
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  feedLedeText: {
    fontFamily: 'Inter',
    fontSize: 17,
    lineHeight: 26,
    fontStyle: 'italic',
  },
  loadingBody: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 12,
  },
  loadingText: {
    fontFamily: 'Inter',
    fontSize: 14,
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  paragraph: {
    fontFamily: 'Inter',
    fontSize: 17,
    lineHeight: 30,
    marginBottom: 20,
    width: '100%',
    flexShrink: 1,
  },
  inlineImageBlock: {
    marginBottom: 24,
    gap: 8,
    width: '100%',
    maxWidth: '100%',
  },
  inlineImageWrap: {
    width: '100%',
    maxWidth: '100%',
    minHeight: 180,
    maxHeight: 360,
    borderRadius: 12,
    overflow: 'hidden',
  },
  inlineImage: {
    width: '100%',
    height: 280,
  },
  inlineImageCaption: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  publisherLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  publisherLinkText: {
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
    textDecorationLine: 'underline',
  },
});
