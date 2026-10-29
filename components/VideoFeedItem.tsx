import { Ionicons } from '@expo/vector-icons';
import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useVideoPlayer, VideoView } from 'expo-video';
import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { YouTubeShortPlayer } from '@/components/YouTubeShortPlayer';
import { tabBarOverlayInset } from '@/constants/Layout';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { ArticleVideo, FeedVideo } from '@/types';
import { openPublisherArticle } from '@/utils/openPublisherBrowser';

interface VideoFeedItemProps {
  video: FeedVideo;
  height: number;
  /** On screen, tab focused: plays. */
  isActive: boolean;
  /** Active or next up: the player is mounted so it can buffer before the swipe lands. */
  shouldLoad: boolean;
  muted: boolean;
  onToggleMuted: () => void;
  onOpenArticle: (video: ArticleVideo) => void;
}

/** Mounted only while `shouldLoad`, so at most two native players exist at a time. */
function VideoPlayerLayer({
  url,
  isActive,
  muted,
  onReadyChange,
  onProgress,
}: {
  url: string;
  isActive: boolean;
  muted: boolean;
  onReadyChange: (ready: boolean) => void;
  onProgress: (fraction: number) => void;
}) {
  const player = useVideoPlayer(url, (instance) => {
    instance.loop = true;
    instance.muted = muted;
    instance.timeUpdateEventInterval = 0.25;
    // iOS: start as soon as there are frames instead of waiting for a stall-proof buffer
    // (these clips are 30-70 MB, so the default made the poster sit there for seconds).
    instance.bufferOptions = { waitsToMinimizeStalling: false };
  });

  useEffect(() => {
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (isActive) {
      player.play();
    } else {
      player.pause();
      // Restart from the top when the user swipes back to it.
      player.currentTime = 0;
    }
  }, [player, isActive]);

  useEventListener(player, 'statusChange', ({ status }) => {
    onReadyChange(status === 'readyToPlay');
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    const duration = player.duration;
    if (duration > 0) onProgress(Math.min(1, currentTime / duration));
  });

  return (
    <VideoView
      player={player}
      style={styles.video}
      contentFit="contain"
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

export const VideoFeedItem = memo(function VideoFeedItem({
  video,
  height,
  isActive,
  shouldLoad,
  muted,
  onToggleMuted,
  onOpenArticle,
}: VideoFeedItemProps) {
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(0);
  const isArticle = video.kind === 'article';
  const poster = isArticle ? (video.posterUrl ?? video.article.imageUrl) : video.posterUrl;
  const title = isArticle ? video.article.title : video.title;
  const source = isArticle
    ? video.article.source
    : `${video.channelName} · ${CURIOSITY_LABELS[video.topic] ?? 'YouTube'}`;
  const onAction = () => {
    if (isArticle) {
      onOpenArticle(video);
    } else {
      // Opens in the in-app browser, so the user stays in Dailyfold.
      void openPublisherArticle(`https://www.youtube.com/shorts/${video.videoId}`, {
        title,
        source: video.channelName,
      });
    }
  };

  useEffect(() => {
    if (!shouldLoad) {
      setReady(false);
      setProgress(0);
    }
  }, [shouldLoad]);

  return (
    <View style={[styles.item, { height }]}>
      {poster ? (
        <Image source={{ uri: poster }} style={styles.video} contentFit="contain" />
      ) : null}

      {shouldLoad ? (
        <View style={[StyleSheet.absoluteFill, { opacity: ready ? 1 : 0 }]}>
          {isArticle ? (
            <VideoPlayerLayer
              url={video.videoUrl}
              isActive={isActive}
              muted={muted}
              onReadyChange={setReady}
              onProgress={setProgress}
            />
          ) : (
            <YouTubeShortPlayer
              videoId={video.videoId}
              isActive={isActive}
              muted={muted}
              onReadyChange={setReady}
              onProgress={setProgress}
            />
          )}
        </View>
      ) : null}

      {isActive && !ready ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onToggleMuted}
        accessibilityRole="button"
        accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
      />

      <LinearGradient
        colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0.85)']}
        style={styles.bottomScrim}
        pointerEvents="none"
      />

      <View style={styles.meta} pointerEvents="box-none">
        <View style={styles.metaText} pointerEvents="none">
          <Text style={styles.source} numberOfLines={1}>
            {source}
          </Text>
          <Text style={styles.title} numberOfLines={3}>
            {title}
          </Text>
        </View>

        <View style={styles.actions}>
          <Pressable
            onPress={onToggleMuted}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
            style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#FFFFFF" />
          </Pressable>
          {isArticle ? (
            <Pressable
              onPress={onAction}
              accessibilityRole="button"
              accessibilityLabel={`Read ${title}`}
              style={({ pressed }) => [styles.readButton, pressed && styles.pressed]}>
              <Text style={styles.readButtonText}>Read story</Text>
              <Ionicons name="arrow-forward" size={16} color="#121212" />
            </Pressable>
          ) : (
            <Pressable
              onPress={onAction}
              hitSlop={10}
              accessibilityRole="link"
              accessibilityLabel={`Open ${title} on YouTube`}
              style={({ pressed }) => [styles.subtleLink, pressed && styles.pressed]}>
              <Text style={styles.subtleLinkText}>YouTube</Text>
              <Ionicons name="open-outline" size={13} color="rgba(255,255,255,0.6)" />
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.progressTrack, { bottom: tabBarOverlayInset() }]} pointerEvents="none">
        <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Plain object (not StyleSheet.absoluteFill): on web VideoView and expo-image hand this
  // straight to a DOM element, which rejects the array form.
  video: StyleSheet.absoluteFillObject,
  item: {
    width: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 260,
  },
  meta: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: tabBarOverlayInset() + 18,
    gap: 14,
  },
  metaText: {
    gap: 6,
  },
  source: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
  },
  title: {
    fontFamily: 'LoraBold',
    fontSize: 21,
    lineHeight: 27,
    color: '#FFFFFF',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  readButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  readButtonText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
    color: '#121212',
  },
  subtleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  subtleLinkText: {
    fontFamily: 'Inter',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
  },
  pressed: {
    opacity: 0.7,
  },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  progressFill: {
    height: 2,
    backgroundColor: '#FFFFFF',
  },
});
