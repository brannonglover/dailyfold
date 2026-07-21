import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ArticleReader } from '@/components/ArticleReader';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { lookupArticleById, rememberOpenArticle } from '@/services/articleSession';
import { patchFeedArticle } from '@/services/articleFeedPatch';
import { fetchArticleById } from '@/services/articles';
import { Article } from '@/types';
import { isValidArticleRouteId } from '@/utils/notificationArticleLink';
import {
  hasOpenablePublisherUrl,
  publisherBrowserHref,
} from '@/utils/openPublisherBrowser';
import { resolveDisplayArticle } from '@/utils/resolveDisplayArticle';

function resolveArticleId(id: string | string[] | undefined): string | undefined {
  const raw = typeof id === 'string' ? id : Array.isArray(id) ? id[0] : undefined;
  return isValidArticleRouteId(raw) ? raw : undefined;
}

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string | string[] }>();
  const articleId = resolveArticleId(id);
  const router = useRouter();
  const { colors } = useTheme();
  const { recordArticleOpen } = usePreferences();
  const redirectedRef = useRef<string | null>(null);
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

  // Deep links / notifications land here — send them straight to the publisher browser.
  useEffect(() => {
    if (!displayArticle) return;
    if (!hasOpenablePublisherUrl(displayArticle.url)) return;
    if (redirectedRef.current === displayArticle.id) return;

    redirectedRef.current = displayArticle.id;
    rememberOpenArticle(displayArticle);
    recordArticleOpen(displayArticle);
    router.replace(
      publisherBrowserHref(displayArticle.url, {
        title: displayArticle.title,
        source: displayArticle.source,
      }),
    );
  }, [displayArticle, recordArticleOpen, router]);

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

  if (hasOpenablePublisherUrl(displayArticle.url)) {
    return (
      <>
        <Stack.Screen
          options={{
            title: '',
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
      <Stack.Screen
        options={{
          title: '',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackTitle: 'Back',
          contentStyle: { backgroundColor: colors.background },
        }}
      />
      <ArticleReader article={displayArticle} />
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
