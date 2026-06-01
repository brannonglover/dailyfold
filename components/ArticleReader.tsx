import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScrollView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ArticleActions } from '@/components/ArticleActions';
import { ArticleImage } from '@/components/ArticleImage';
import { SubscriptionBanner } from '@/components/SubscriptionBanner';
import { useTheme } from '@/hooks/useTheme';
import { fetchArticleReaderContent } from '@/services/articleContent';
import { Article } from '@/types';
import { ArticleReaderContent } from '@/types/articleContent';
import { resolveReaderParagraphLayout } from '@/utils/articleParagraphs';
import { openPublisherArticle } from '@/utils/openPublisherBrowser';

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

export function ArticleReader({ article }: ArticleReaderProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const requiresSubscription = article.requiresSubscription === true;
  const [readerContent, setReaderContent] = useState<ArticleReaderContent | null>(null);
  const [contentError, setContentError] = useState(false);
  const [isLoadingContent, setIsLoadingContent] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setIsLoadingContent(true);
    setContentError(false);
    setReaderContent(null);

    fetchArticleReaderContent(article.id)
      .then((content) => {
        if (!cancelled) setReaderContent(content);
      })
      .catch(() => {
        if (!cancelled) setContentError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingContent(false);
      });

    return () => {
      cancelled = true;
    };
  }, [article.id]);

  const extractedParagraphs =
    readerContent && readerContent.paragraphs.length > 0 ? readerContent.paragraphs : null;
  const { feedLede, bodyParagraphs } = resolveReaderParagraphLayout({
    article,
    extractedParagraphs,
  });
  const feedLedeText =
    isLoadingContent && article.excerpt.trim() ? article.excerpt.trim() : feedLede;
  const showFeedLede = !!feedLedeText;
  const paragraphs = bodyParagraphs;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        bounces
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}>
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
            <Text style={[styles.source, { color: colors.accent }]}>{article.source}</Text>
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

          {showFeedLede && feedLedeText ? (
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
                {feedLedeText}
              </Text>
            </View>
          ) : null}

          {isLoadingContent ? (
            <View style={styles.loadingBody}>
              <ActivityIndicator color={colors.textSecondary} />
              <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                Loading article…
              </Text>
            </View>
          ) : null}

          {contentError && !isLoadingContent ? (
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              We couldn't load more of this article in the app.
            </Text>
          ) : null}

          {!isLoadingContent
            ? paragraphs.map((paragraph, index) => (
                <Text key={index} style={[styles.paragraph, { color: colors.text }]}>
                  {paragraph}
                </Text>
              ))
            : null}

          <Pressable
            onPress={() => openPublisherArticle(article.url)}
            style={({ pressed }) => [styles.publisherLink, pressed && { opacity: 0.7 }]}
            accessibilityRole="link"
            accessibilityLabel={`View full article on ${article.source}`}>
            <Ionicons name="open-outline" size={16} color={colors.textSecondary} />
            <Text style={[styles.publisherLinkText, { color: colors.textSecondary }]}>
              {`View full article on ${article.source}`}
            </Text>
          </Pressable>
        </View>
      </ScrollView>

      <ArticleActions article={article} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    paddingHorizontal: 24,
    paddingTop: 8,
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
    marginBottom: 24,
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
