import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, InteractionManager, StyleSheet, Text, View } from 'react-native';

import { ArticleReader } from '@/components/ArticleReader';
import { useTheme } from '@/hooks/useTheme';
import { getRememberedArticle, rememberOpenArticle } from '@/services/articleSession';
import { patchFeedArticle } from '@/services/articleFeedPatch';
import { fetchArticleById } from '@/services/articles';
import { Article } from '@/types';
import { isValidArticleRouteId } from '@/utils/notificationArticleLink';

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
    return getRememberedArticle(articleId);
  });
  const [isLoading, setIsLoading] = useState(() => !article);

  useEffect(() => {
    if (!articleId) {
      setIsLoading(false);
      return;
    }

    const remembered = getRememberedArticle(articleId);
    if (remembered) {
      setArticle(remembered);
      setIsLoading(false);
    } else {
      setIsLoading(true);
    }

    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      fetchArticleById(articleId)
        .then((fetched) => {
          if (cancelled) return;
          if (fetched) {
            rememberOpenArticle(fetched);
            patchFeedArticle(fetched);
            setArticle(fetched);
            return;
          }
          if (!remembered) setArticle(undefined);
        })
        .catch(() => {
          if (!cancelled && !remembered) setArticle(undefined);
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
    });

    return () => {
      cancelled = true;
      task.cancel();
    };
  }, [articleId]);

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

  if (!article) {
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
          title: article.source,
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
      <ArticleReader article={article} />
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
