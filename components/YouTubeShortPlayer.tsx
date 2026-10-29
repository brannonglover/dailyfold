import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { buildYouTubeShortSource } from '@/utils/youtubeEmbed';

interface YouTubeShortPlayerProps {
  videoId: string;
  isActive: boolean;
  muted: boolean;
  onReadyChange: (ready: boolean) => void;
  onProgress: (fraction: number) => void;
}

/**
 * A Short in a chromeless, muted-by-default YouTube iframe. YouTube hands out no video files,
 * so this is a WebView; the feed mounts at most two (active + next) and drives them with the
 * iframe API: the page reports `playing` / `p:<fraction>`, the app sends play / pause / mute.
 */
export function YouTubeShortPlayer({
  videoId,
  isActive,
  muted,
  onReadyChange,
  onProgress,
}: YouTubeShortPlayerProps) {
  const webViewRef = useRef<WebView>(null);
  const playerReadyRef = useRef(false);
  const warmedUpRef = useRef(false);
  // Read from the bridge callbacks, which outlive the render that created them.
  const isActiveRef = useRef(isActive);
  const mutedRef = useRef(muted);
  isActiveRef.current = isActive;
  mutedRef.current = muted;
  const source = useMemo(() => buildYouTubeShortSource(videoId, muted), [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = (script: string) => {
    if (playerReadyRef.current) webViewRef.current?.injectJavaScript(`${script};true;`);
  };

  useEffect(() => {
    run(isActive ? 'ytPlayer.playVideo()' : 'ytPlayer.pauseVideo();ytPlayer.seekTo(0,true)');
  }, [isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    run(muted ? 'ytPlayer.mute()' : 'ytPlayer.unMute()');
  }, [muted]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMessage = (event: WebViewMessageEvent) => {
    const message = event.nativeEvent.data;
    if (message === 'ready') {
      playerReadyRef.current = true;
      // Every Short starts playing, silently, as soon as its player is up: a queued-up one
      // then has its first seconds buffered by the time the user swipes to it.
      run('ytPlayer.mute();ytPlayer.playVideo()');
    } else if (message === 'playing') {
      if (!warmedUpRef.current) {
        warmedUpRef.current = true;
        if (!isActiveRef.current) run('ytPlayer.pauseVideo();ytPlayer.seekTo(0,true)');
        run(mutedRef.current ? 'ytPlayer.mute()' : 'ytPlayer.unMute()');
      }
      onReadyChange(true);
    } else if (message.startsWith('p:')) {
      onProgress(Number(message.slice(2)) || 0);
    }
  };

  return (
    <WebView
      ref={webViewRef}
      source={source}
      style={styles.webview}
      onMessage={onMessage}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      originWhitelist={['*']}
      setSupportMultipleWindows={false}
      allowsFullscreenVideo={false}
      // The feed's Pressable overlay owns every tap; keep the page from stealing swipes.
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  webview: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
});
