import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview';

import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { fetchArticleById } from '@/services/articles';
import { lookupArticleById, lookupArticleByUrl, rememberOpenArticle } from '@/services/articleSession';
import { hasOpenablePublisherUrl } from '@/utils/openPublisherBrowser';
import { buildWebViewReaderHtml, type WebViewReaderArticle } from '@/utils/webviewReaderHtml';
import { WEBVIEW_READABILITY_EXTRACT_JS } from '@/utils/webviewReadabilityScript';
import { WEBVIEW_READ_PROGRESS_INJECT_JS } from '@/utils/webviewReadProgressScript';
import { Article } from '@/types';

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0];
  return undefined;
}

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, '');
  } catch {
    return null;
  }
}

type ReaderExtractMessage =
  | {
      type: 'readerResult';
      ok: true;
      title: string;
      byline?: string;
      content: string;
      excerpt?: string;
      siteName?: string;
      baseUrl?: string;
    }
  | {
      type: 'readerResult';
      ok: false;
      error?: string;
    };

type ReadProgressMessage = {
  type: 'readProgress';
  readPercent: number;
};

type BrowserWebMessage = ReaderExtractMessage | ReadProgressMessage;

function parseBrowserWebMessage(raw: string): BrowserWebMessage | null {
  try {
    const data = JSON.parse(raw) as BrowserWebMessage;
    if (!data?.type) return null;
    if (data.type === 'readProgress') return data;
    if (data.type === 'readerResult') return data;
    return null;
  } catch {
    return null;
  }
}

/**
 * Injected before page content loads to force light-mode rendering.
 * Many publisher sites partially implement prefers-color-scheme: dark, leading
 * to dark text on a dark background when our app's dark theme leaks into the
 * WKWebView / Android WebView.  Forcing light here matches what users see in a
 * normal browser.
 */
const FORCE_LIGHT_SCHEME_JS = `(function(){
  var m=document.createElement('meta');
  m.name='color-scheme';m.content='light only';
  document.head.appendChild(m);
  var s=document.createElement('style');
  s.textContent=':root{color-scheme:light only!important}';
  document.head.appendChild(s);
})();true;`;

export default function PublisherBrowserScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    url?: string | string[];
    title?: string | string[];
    source?: string | string[];
    articleId?: string | string[];
  }>();

  const { recordArticleOpen, recordArticleEngagement, isLiked, toggleLike } = usePreferences();

  const initialUrl = useMemo(() => {
    const raw = firstParam(params.url)?.trim();
    if (!raw) return null;
    if (hasOpenablePublisherUrl(raw)) return raw;
    try {
      const decoded = decodeURIComponent(raw);
      return hasOpenablePublisherUrl(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }, [params.url]);

  const paramSource = firstParam(params.source)?.trim();
  const paramTitle = firstParam(params.title)?.trim();
  const paramArticleId = firstParam(params.articleId)?.trim();

  const resolveTrackedArticle = useCallback((): Article | undefined => {
    if (paramArticleId) {
      const byId = lookupArticleById(paramArticleId);
      if (byId) return byId;
    }
    return lookupArticleByUrl(initialUrl ?? undefined);
  }, [paramArticleId, initialUrl]);

  const [trackedArticle, setTrackedArticle] = useState<Article | undefined>(() =>
    resolveTrackedArticle(),
  );

  useEffect(() => {
    const resolved = resolveTrackedArticle();
    if (resolved) {
      setTrackedArticle(resolved);
      return;
    }
    if (!paramArticleId) return;

    let cancelled = false;
    void fetchArticleById(paramArticleId).then((fetched) => {
      if (cancelled || !fetched) return;
      rememberOpenArticle(fetched);
      setTrackedArticle(fetched);
    });

    return () => {
      cancelled = true;
    };
  }, [paramArticleId, resolveTrackedArticle]);

  const webRef = useRef<WebView>(null);
  const readerWebRef = useRef<WebView>(null);
  const openedAtRef = useRef(Date.now());
  const maxReadPercentRef = useRef(0);
  const recordedOpenRef = useRef<string | null>(null);
  const [currentUrl, setCurrentUrl] = useState(initialUrl ?? '');
  const [pageTitle, setPageTitle] = useState(paramTitle ?? '');
  const [canGoBack, setCanGoBack] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [readerArticle, setReaderArticle] = useState<WebViewReaderArticle | null>(null);
  const [isConvertingReader, setIsConvertingReader] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState({ top: 0, right: 16 });
  const moreButtonRef = useRef<View>(null);
  const readerMode = readerArticle != null;

  useEffect(() => {
    if (!trackedArticle) return;
    if (recordedOpenRef.current === trackedArticle.id) return;
    recordedOpenRef.current = trackedArticle.id;
    recordArticleOpen(trackedArticle);
  }, [trackedArticle, recordArticleOpen]);

  useEffect(() => {
    if (!trackedArticle) return;
    openedAtRef.current = Date.now();
    maxReadPercentRef.current = 0;

    return () => {
      recordArticleEngagement(trackedArticle, {
        readPercent: Math.round(maxReadPercentRef.current),
        dwellSeconds: Math.round((Date.now() - openedAtRef.current) / 1000),
      });
    };
  }, [trackedArticle, recordArticleEngagement]);

  const injectReadProgress = useCallback((target: WebView | null) => {
    target?.injectJavaScript(WEBVIEW_READ_PROGRESS_INJECT_JS);
  }, []);

  const headerLabel =
    paramSource ||
    hostnameFromUrl(currentUrl || initialUrl || '') ||
    pageTitle ||
    'Article';

  const readerHtml = useMemo(() => {
    if (!readerArticle) return null;
    return buildWebViewReaderHtml(readerArticle, scheme);
  }, [readerArticle, scheme]);

  const handleClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  }, [router]);

  const convertTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearConvertTimeout = useCallback(() => {
    if (convertTimeoutRef.current) {
      clearTimeout(convertTimeoutRef.current);
      convertTimeoutRef.current = null;
    }
  }, []);

  const exitReaderMode = useCallback(() => {
    clearConvertTimeout();
    setReaderArticle(null);
    setIsConvertingReader(false);
  }, [clearConvertTimeout]);

  const handleNavChange = useCallback((nav: WebViewNavigation) => {
    setCurrentUrl(nav.url);
    setCanGoBack(nav.canGoBack);
    if (nav.title?.trim()) {
      setPageTitle(nav.title.trim());
    }
  }, []);

  const handleShare = useCallback(async () => {
    const url = currentUrl || initialUrl;
    if (!url) return;
    try {
      if (Platform.OS === 'ios') {
        await Share.share({ url });
      } else {
        await Share.share({ message: url });
      }
    } catch {
      // User dismissed or share unavailable.
    }
  }, [currentUrl, initialUrl]);

  const handleOpenExternal = useCallback(async () => {
    const url = currentUrl || initialUrl;
    if (!url) return;
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Unable to open', 'Could not open this link in your browser.');
    }
  }, [currentUrl, initialUrl]);

  const handleToggleReadLater = useCallback(async () => {
    let article = trackedArticle ?? resolveTrackedArticle();
    if (!article && paramArticleId) {
      const fetched = await fetchArticleById(paramArticleId);
      if (fetched) {
        rememberOpenArticle(fetched);
        article = fetched;
        setTrackedArticle(fetched);
      }
    }
    if (!article) {
      Alert.alert('Unable to save', 'This page could not be matched to a Dailyfold story.');
      return;
    }

    toggleLike(article);
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, [trackedArticle, resolveTrackedArticle, paramArticleId, toggleLike]);

  const readLaterArticleId = trackedArticle?.id ?? paramArticleId;
  const canSaveForLater = Boolean(readLaterArticleId || resolveTrackedArticle());
  const savedForLater = readLaterArticleId ? isLiked(readLaterArticleId) : false;
  const externalBrowserLabel = Platform.OS === 'ios' ? 'Open in Safari' : 'Open in browser';

  const closeOverflowMenu = useCallback(() => {
    setOverflowOpen(false);
  }, []);

  const openOverflowMenu = useCallback(() => {
    moreButtonRef.current?.measureInWindow((x, y, width, height) => {
      const windowWidth = Dimensions.get('window').width;
      setMenuAnchor({
        top: y + height + 6,
        right: Math.max(12, windowWidth - x - width),
      });
      setOverflowOpen(true);
    });
  }, []);

  const runOverflowAction = useCallback(
    (action: () => void | Promise<void>) => {
      closeOverflowMenu();
      void action();
    },
    [closeOverflowMenu],
  );

  const handleRetry = useCallback(() => {
    setHasError(false);
    setIsLoading(true);
    setProgress(0);
    exitReaderMode();
    webRef.current?.reload();
  }, [exitReaderMode]);

  const handleWebBack = useCallback(() => {
    closeOverflowMenu();
    if (readerMode) {
      exitReaderMode();
      return;
    }
    if (canGoBack) {
      webRef.current?.goBack();
      return;
    }
    handleClose();
  }, [canGoBack, closeOverflowMenu, exitReaderMode, handleClose, readerMode]);

  const enterReaderMode = useCallback(() => {
    if (isLoading || isConvertingReader || hasError) return;
    setIsConvertingReader(true);
    clearConvertTimeout();
    convertTimeoutRef.current = setTimeout(() => {
      setIsConvertingReader(false);
      Alert.alert(
        'Reader unavailable',
        'This page could not be converted to Reader view. You can keep reading the original page.',
      );
    }, 8000);
    webRef.current?.injectJavaScript(WEBVIEW_READABILITY_EXTRACT_JS);
  }, [clearConvertTimeout, hasError, isConvertingReader, isLoading]);

  const handleWebMessage = useCallback(
    (event: WebViewMessageEvent) => {
      const message = parseBrowserWebMessage(event.nativeEvent.data);
      if (!message) return;

      if (message.type === 'readProgress') {
        maxReadPercentRef.current = Math.max(
          maxReadPercentRef.current,
          Math.min(100, message.readPercent),
        );
        return;
      }

      clearConvertTimeout();
      setIsConvertingReader(false);

      if (!message.ok) {
        Alert.alert(
          'Reader unavailable',
          'This page could not be converted to Reader view. You can keep reading the original page.',
        );
        return;
      }

      setReaderArticle({
        title: message.title || pageTitle || paramTitle || 'Article',
        byline: message.byline,
        content: message.content,
        siteName: message.siteName || paramSource,
        baseUrl: message.baseUrl || currentUrl || initialUrl || undefined,
      });
    },
    [clearConvertTimeout, currentUrl, initialUrl, pageTitle, paramSource, paramTitle],
  );

  if (!initialUrl) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
        <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
          <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.text} />
            </Pressable>
            <Text style={[styles.headerLabel, { color: colors.text }]} numberOfLines={1}>
              Unavailable
            </Text>
            <View style={styles.iconSlot} />
          </View>
          <View style={styles.centered}>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              This link could not be opened.
            </Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false, gestureEnabled: true }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View
          style={[
            styles.topBarWrap,
            {
              paddingTop: insets.top,
              backgroundColor: colors.background,
              borderBottomColor: colors.border,
            },
          ]}>
          <View style={styles.topBar}>
            <Pressable
              onPress={handleWebBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                readerMode ? 'Back to original page' : canGoBack ? 'Go back' : 'Close'
              }>
              <Ionicons
                name={readerMode || canGoBack ? 'chevron-back' : 'close'}
                size={24}
                color={colors.text}
              />
            </Pressable>

            <View style={styles.headerCenter}>
              <Text style={[styles.headerLabel, { color: colors.text }]} numberOfLines={1}>
                {headerLabel}
              </Text>
            </View>

            <View style={styles.topActions}>
              <Pressable
                onPress={readerMode ? exitReaderMode : enterReaderMode}
                disabled={!readerMode && (isLoading || isConvertingReader || hasError)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={readerMode ? 'Show original page' : 'Show Reader view'}
                style={({ pressed }) => [
                  styles.readerToggle,
                  {
                    backgroundColor: readerMode ? colors.accentMuted : colors.border,
                    opacity:
                      pressed || (!readerMode && (isLoading || isConvertingReader)) ? 0.7 : 1,
                  },
                ]}>
                {isConvertingReader ? (
                  <ActivityIndicator size="small" color={colors.text} />
                ) : (
                  <Ionicons
                    name={readerMode ? 'globe-outline' : 'reader-outline'}
                    size={18}
                    color={readerMode ? colors.accent : colors.text}
                  />
                )}
              </Pressable>
              <Pressable
                onPress={() => void handleShare()}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Share link">
                <Ionicons name="share-outline" size={22} color={colors.text} />
              </Pressable>
              <Pressable
                ref={moreButtonRef}
                onPress={openOverflowMenu}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="More options"
                accessibilityState={{ expanded: overflowOpen }}>
                <Ionicons name="ellipsis-horizontal" size={22} color={colors.text} />
              </Pressable>
            </View>
          </View>

          <View style={[styles.progressTrack, { backgroundColor: colors.border }]}>
            {!readerMode && isLoading && progress > 0 && progress < 1 ? (
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.accent, width: `${Math.round(progress * 100)}%` },
                ]}
              />
            ) : null}
          </View>
        </View>

        {overflowOpen ? (
          <View style={styles.menuLayer} pointerEvents="box-none">
            <Pressable
              style={styles.menuBackdrop}
              onPress={closeOverflowMenu}
              accessibilityRole="button"
              accessibilityLabel="Dismiss menu"
            />
            <View
              style={[
                styles.menuPanel,
                {
                  top: menuAnchor.top,
                  right: menuAnchor.right,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              {canSaveForLater ? (
                <Pressable
                  onPress={() => runOverflowAction(handleToggleReadLater)}
                  style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={
                    savedForLater ? 'Remove from Read Later' : 'Save for Read Later'
                  }>
                  <Ionicons
                    name={savedForLater ? 'bookmark' : 'bookmark-outline'}
                    size={18}
                    color={savedForLater ? colors.accent : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.menuRowLabel,
                      { color: savedForLater ? colors.accent : colors.text },
                    ]}>
                    {savedForLater ? 'Remove from Read Later' : 'Read Later'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => runOverflowAction(handleShare)}
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                accessibilityRole="button"
                accessibilityLabel="Share link">
                <Ionicons name="share-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.menuRowLabel, { color: colors.text }]}>Share link</Text>
              </Pressable>
              <Pressable
                onPress={() => runOverflowAction(handleOpenExternal)}
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                accessibilityRole="button"
                accessibilityLabel={externalBrowserLabel}>
                <Ionicons name="open-outline" size={18} color={colors.textSecondary} />
                <Text style={[styles.menuRowLabel, { color: colors.text }]}>
                  {externalBrowserLabel}
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {hasError ? (
          <View style={styles.centered}>
            <Text style={[styles.errorText, { color: colors.textSecondary }]}>
              This page couldn't be loaded.
            </Text>
            <Pressable
              onPress={handleRetry}
              style={({ pressed }) => [
                styles.retryButton,
                { backgroundColor: colors.text, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Retry">
              <Text style={[styles.retryText, { color: colors.background }]}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.webviewStack}>
            {!readerMode ? (
              <WebView
                ref={webRef}
                // currentUrl (not initialUrl) so unmount/remount on Reader exit resumes
                // wherever the user had navigated to, not back at the start.
                source={{ uri: currentUrl || initialUrl }}
                // Unmounted (not just hidden) while Reader is showing — a hidden-but-mounted
                // WKWebView, even at 1x1px off-screen, can still composite its native layer
                // on top of siblings on iOS and was leaving a black band over Reader content.
                style={styles.webview}
                onNavigationStateChange={handleNavChange}
                onLoadProgress={({ nativeEvent }) => setProgress(nativeEvent.progress)}
                onLoadStart={() => {
                  setIsLoading(true);
                  setHasError(false);
                  // Fresh navigation — drop any Reader snapshot from the previous page.
                  setReaderArticle(null);
                  setIsConvertingReader(false);
                }}
                onLoadEnd={() => {
                  setIsLoading(false);
                  setProgress(1);
                  injectReadProgress(webRef.current);
                }}
                onError={() => {
                  setIsLoading(false);
                  setHasError(true);
                }}
                onHttpError={(event) => {
                  if (event.nativeEvent.statusCode >= 500) {
                    setHasError(true);
                    setIsLoading(false);
                  }
                }}
                onMessage={handleWebMessage}
                allowsBackForwardNavigationGestures
                startInLoadingState
                renderLoading={() => (
                  <View style={[styles.loadingOverlay, { backgroundColor: '#FFFFFF' }]}>
                    <ActivityIndicator color={colors.textSecondary} />
                  </View>
                )}
                setSupportMultipleWindows={false}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction={false}
                decelerationRate="normal"
                forceDarkOn={false}
                injectedJavaScriptBeforeContentLoaded={FORCE_LIGHT_SCHEME_JS}
              />
            ) : null}

            {readerMode && readerHtml ? (
              <WebView
                ref={readerWebRef}
                source={{ html: readerHtml, baseUrl: readerArticle?.baseUrl || initialUrl }}
                style={[styles.readerWebview, { backgroundColor: colors.background }]}
                originWhitelist={['*']}
                setSupportMultipleWindows={false}
                showsVerticalScrollIndicator={false}
                decelerationRate="normal"
                onMessage={handleWebMessage}
                onLoadEnd={() => injectReadProgress(readerWebRef.current)}
              />
            ) : null}

            {isConvertingReader ? (
              <View style={[styles.convertingOverlay, { backgroundColor: colors.background }]}>
                <ActivityIndicator color={colors.textSecondary} />
                <Text style={[styles.convertingText, { color: colors.textSecondary }]}>
                  Converting to Reader…
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBarWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  menuLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  menuBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  menuPanel: {
    position: 'absolute',
    minWidth: 220,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  menuRowPressed: {
    opacity: 0.7,
  },
  menuRowLabel: {
    fontFamily: 'InterMedium',
    fontSize: 15,
    flexShrink: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    minHeight: 48,
  },
  headerCenter: {
    flex: 1,
    minWidth: 0,
  },
  headerLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  readerToggle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconSlot: {
    width: 24,
  },
  progressTrack: {
    height: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  webviewStack: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  readerWebview: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  convertingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  convertingText: {
    fontFamily: 'Inter',
    fontSize: 14,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryText: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
  },
});
