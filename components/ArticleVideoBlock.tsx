import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '@/hooks/useTheme';
import { ARTICLE_NO_IMAGE, isArticlePlaceholderImageUrl, resolveArticleImageUrl } from '@/constants/images';
import { ArticleReaderBlock } from '@/types/articleContent';
import { openPublisherArticle } from '@/utils/openPublisherBrowser';

type VideoBlock = Extract<ArticleReaderBlock, { type: 'video' }>;

function providerLabel(provider?: string): string {
  if (provider === 'youtube') return 'YouTube';
  if (provider === 'vimeo') return 'Vimeo';
  return 'source site';
}

function usesWebEmbed(provider?: string): boolean {
  return provider === 'youtube' || provider === 'vimeo';
}

function DirectVideoPlayer({ url }: { url: string }) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = false;
  });

  return (
    <VideoView
      player={player}
      style={styles.player}
      contentFit="contain"
      nativeControls
      allowsFullscreen
      allowsPictureInPicture
    />
  );
}

function EmbedVideoPlayer({ url }: { url: string }) {
  return (
    <WebView
      source={{ uri: url }}
      style={styles.player}
      allowsFullscreenVideo
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      originWhitelist={['*']}
    />
  );
}

function VideoFallback({
  block,
  colors,
  onRetry,
}: {
  block: VideoBlock;
  colors: ReturnType<typeof useTheme>['colors'];
  onRetry?: () => void;
}) {
  const posterUri = block.poster ? resolveArticleImageUrl(block.poster) : ARTICLE_NO_IMAGE;
  const showPoster =
    block.poster &&
    posterUri !== ARTICLE_NO_IMAGE &&
    !isArticlePlaceholderImageUrl(posterUri);

  return (
    <View style={styles.fallback}>
      {showPoster ? (
        <Image
          source={{ uri: posterUri }}
          style={styles.poster}
          contentFit="cover"
          accessibilityRole="image"
          accessibilityLabel={block.caption ?? 'Video poster'}
        />
      ) : (
        <View style={[styles.poster, styles.posterPlaceholder, { backgroundColor: colors.surface }]}>
          <Ionicons name="videocam-outline" size={40} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.fallbackOverlay}>
        <Text style={[styles.fallbackTitle, { color: colors.text }]}>
          {block.caption ?? 'Video unavailable in app'}
        </Text>
        <Text style={[styles.fallbackBody, { color: colors.textSecondary }]}>
          {`Watch on ${providerLabel(block.provider)}`}
        </Text>
        <View style={styles.fallbackActions}>
          {onRetry ? (
            <Pressable
              onPress={onRetry}
              style={({ pressed }) => [styles.fallbackButton, pressed && { opacity: 0.7 }]}>
              <Text style={[styles.fallbackButtonText, { color: colors.text }]}>Try again</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => openPublisherArticle(block.url)}
            style={({ pressed }) => [styles.fallbackButton, pressed && { opacity: 0.7 }]}>
            <Ionicons name="open-outline" size={16} color={colors.text} />
            <Text style={[styles.fallbackButtonText, { color: colors.text }]}>Open video</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function ArticleVideoBlock({
  block,
  colors,
}: {
  block: VideoBlock;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const [loadFailed, setLoadFailed] = useState(!block.url.trim());
  const [retryKey, setRetryKey] = useState(0);
  const embed = usesWebEmbed(block.provider);

  useEffect(() => {
    setLoadFailed(!block.url.trim());
  }, [block.url, retryKey]);

  if (loadFailed) {
    return (
      <View style={styles.block}>
        <VideoFallback
          block={block}
          colors={colors}
          onRetry={() => {
            setLoadFailed(false);
            setRetryKey((value) => value + 1);
          }}
        />
        {block.caption ? (
          <Text style={[styles.caption, { color: colors.textSecondary }]}>{block.caption}</Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.block}>
      <View style={[styles.playerWrap, { backgroundColor: colors.surface }]}>
        {embed ? (
          <EmbedVideoPlayer key={retryKey} url={block.url} />
        ) : (
          <DirectVideoPlayer key={retryKey} url={block.url} />
        )}
      </View>
      {block.caption ? (
        <Text style={[styles.caption, { color: colors.textSecondary }]}>{block.caption}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 24,
    gap: 8,
    width: '100%',
    maxWidth: '100%',
  },
  playerWrap: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  caption: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  fallback: {
    width: '100%',
    borderRadius: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  poster: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  posterPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  fallbackTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    textAlign: 'center',
  },
  fallbackBody: {
    fontFamily: 'Inter',
    fontSize: 13,
    textAlign: 'center',
  },
  fallbackActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  fallbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
  },
  fallbackButtonText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
});
