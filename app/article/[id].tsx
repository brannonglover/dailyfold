import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ArticleReader } from '@/components/ArticleReader';
import { useTheme } from '@/hooks/useTheme';
import { lookupArticleById, rememberOpenArticle } from '@/services/articleSession';
import { patchFeedArticle } from '@/services/articleFeedPatch';
import { fetchArticleById } from '@/services/articles';
import { seedReaderContentFromArticle } from '@/services/articleContent';
import { Article } from '@/types';
import { isValidArticleRouteId } from '@/utils/notificationArticleLink';
import { resolveDisplayArticle } from '@/utils/resolveDisplayArticle';

function resolveArticleId(id: string | string[] | undefined): string | undefined {
  const raw = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
  return isValidArticleRouteId(raw) ? raw : undefined;
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const articleId = resolveArticleId(id);
  const { colors } = useTheme();
  const [article, setArticle] = useState<Article | undefined>(() => {
    if (!articleId) return undefined;
    return lookupArticleById(articleId);
  });
  const [isLoading, setIsLoading] = useState(() => !article);

  const displayArticle = resolveDisplayArticle(articleId, article, lookupArticleById);

  useEffect(() => {
    if (!articleId) {
      setIsLoading(false);
      return;
    }

    const known = lookupArticleById(articleId);
    if (known) {
      seedReaderContentFromArticle(known);
      setArticle(known);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    let cancelled = false;
    fetchArticleById(articleId)
      .then((fetched) => {
        if (cancelled) return;
        if (!fetched) {
          if (!known) setArticle(undefined);
          return;
        }
        if (fetched.id !== articleId) return;
        rememberOpenArticle(fetched);
        seedReaderContentFromArticle(fetched);
        patchFeedArticle(fetched);
        setArticle(fetched);
      })
      .catch(() => {
        if (!cancelled && !known) setArticle(undefined);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [articleId]);

  if (!displayArticle) {
    if (isLoading) {
      return (
        <>
          <Stack.Screen
            options={{
              title: 'Loading…',
              headerStyle: { backgroundColor: colors.background },
              headerShadowVisible: false,
              headerTintColor: colors.text,
              headerBackTitle: 'Back',
              contentStyle: { backgroundColor: colors.background },
            }}
          />
          <View style={[styles.centered, { backgroundColor: colors.background }]}>
            <ActivityIndicator color={colors.text} />
          </View>
        </>
      );
    }

    return (
      <>
        <Stack.Screen options={{ title: 'Not found' }} />
        <View style={[styles.notFound, { backgroundColor: colors.background }]}>
          <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>
            This article could not be found.
          </Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: displayArticle.source,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
          animationMatchesGesture: true,
          animation: 'slide_from_right',
        }}
      />
      <ArticleReader key={articleId} article={displayArticle} />
    </>
  );
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFound: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  notFoundText: {
    fontFamily: 'Inter',
    fontSize: 16,
    textAlign: 'center',
  },
});
