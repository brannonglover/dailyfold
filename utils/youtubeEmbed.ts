/** Matches ios.bundleIdentifier / android.package in app.config.js. */
export const YOUTUBE_EMBED_ORIGIN = 'https://com.brannonglover.dailyfold';

export const WEB_EMBED_PLAY_MESSAGE = 'playing';

type EmbedHtmlOptions = {
  autoplay?: boolean;
  notifyOnPlay?: boolean;
};

export function extractYouTubeVideoId(url: string): string | null {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === 'youtu.be') {
      return parsed.pathname.slice(1).split('/')[0] || null;
    }
    if (host.includes('youtube.com') || host.includes('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
      const watchId = parsed.searchParams.get('v');
      if (watchId) return watchId;
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] ?? null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function isYouTubePlaybackUrl(url: string, provider?: string): boolean {
  return provider === 'youtube' || extractYouTubeVideoId(url) !== null;
}

export function buildYouTubeEmbedSrc(
  videoId: string,
  origin = YOUTUBE_EMBED_ORIGIN,
): string {
  const params = new URLSearchParams({
    playsinline: '1',
    rel: '0',
    modestbranding: '1',
    origin,
    fs: '1',
    enablejsapi: '1',
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export function buildYouTubeEmbedHtml(
  videoId: string,
  origin = YOUTUBE_EMBED_ORIGIN,
  options: EmbedHtmlOptions = {},
): string {
  const { autoplay = false, notifyOnPlay = false } = options;
  const playerVars = {
    playsinline: autoplay ? 0 : 1,
    rel: 0,
    modestbranding: 1,
    origin,
    autoplay: autoplay ? 1 : 0,
    fs: 1,
    enablejsapi: 1,
  };

  const onPlayHandler = notifyOnPlay
    ? `if (event.data === YT.PlayerState.PLAYING && window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage('${WEB_EMBED_PLAY_MESSAGE}');
        if (window.ytPlayer && window.ytPlayer.pauseVideo) {
          window.ytPlayer.pauseVideo();
        }
      }`
    : '';

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body, #player { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    </style>
    <script src="https://www.youtube.com/iframe_api"></script>
  </head>
  <body>
    <div id="player"></div>
    <script>
      function onYouTubeIframeAPIReady() {
        window.ytPlayer = new YT.Player('player', {
          videoId: '${videoId}',
          playerVars: ${JSON.stringify(playerVars)},
          events: {
            onStateChange: function(event) {
              ${onPlayHandler}
            }
          }
        });
      }
    </script>
  </body>
</html>`;
}

/**
 * Chromeless, looping player page for the Videos feed. Starts paused (the app plays the active
 * one) and reports back over the React Native bridge: `ready`, `playing`, `p:<0..1>`.
 */
export function buildYouTubeShortHtml(
  videoId: string,
  muted: boolean,
  origin = YOUTUBE_EMBED_ORIGIN,
): string {
  const playerVars = {
    playsinline: 1,
    controls: 0,
    rel: 0,
    modestbranding: 1,
    disablekb: 1,
    fs: 0,
    iv_load_policy: 3,
    loop: 1,
    playlist: videoId,
    origin,
    autoplay: 0,
    enablejsapi: 1,
  };

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />
    <style>
      html, body, #player { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
    </style>
    <script src="https://www.youtube.com/iframe_api"></script>
  </head>
  <body>
    <div id="player"></div>
    <script>
      function post(message) {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
      }
      function onYouTubeIframeAPIReady() {
        window.ytPlayer = new YT.Player('player', {
          videoId: '${videoId}',
          playerVars: ${JSON.stringify(playerVars)},
          events: {
            onReady: function() {
              ${muted ? 'ytPlayer.mute();' : ''}
              post('ready');
              setInterval(function() {
                var d = ytPlayer.getDuration();
                if (d > 0 && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) {
                  post('p:' + Math.min(1, ytPlayer.getCurrentTime() / d));
                }
              }, 250);
            },
            onStateChange: function(event) {
              if (event.data === YT.PlayerState.PLAYING) post('playing');
              if (event.data === YT.PlayerState.ENDED) { ytPlayer.seekTo(0, true); ytPlayer.playVideo(); }
            }
          }
        });
      }
    </script>
  </body>
</html>`;
}

export function buildYouTubeShortSource(
  videoId: string,
  muted: boolean,
): { html: string; baseUrl: string } {
  return {
    html: buildYouTubeShortHtml(videoId, muted),
    baseUrl: YOUTUBE_EMBED_ORIGIN,
  };
}

export function buildYouTubeEmbedSource(
  url: string,
  options: EmbedHtmlOptions = {},
): { html: string; baseUrl: string } | null {
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;

  return {
    html: buildYouTubeEmbedHtml(videoId, YOUTUBE_EMBED_ORIGIN, {
      notifyOnPlay: true,
      ...options,
    }),
    baseUrl: YOUTUBE_EMBED_ORIGIN,
  };
}

function buildIframeEmbedHtml(
  embedUrl: string,
  baseUrl: string,
  options?: { notifyOnPlay?: boolean; title?: string },
): { html: string; baseUrl: string } {
  const title = options?.title ?? 'Embedded video';
  const playListenerScript = options?.notifyOnPlay
    ? `<script src="https://player.vimeo.com/api/player.js"></script>
    <script>
      (function attachPlayListener() {
        var iframe = document.querySelector('iframe');
        if (!iframe) return;
        if (window.Vimeo) {
          var player = new Vimeo.Player(iframe);
          player.on('play', function() {
            if (window.ReactNativeWebView) {
              window.ReactNativeWebView.postMessage('${WEB_EMBED_PLAY_MESSAGE}');
              player.pause();
            }
          });
          return;
        }
        setTimeout(attachPlayListener, 50);
      })();
    </script>`
    : '';

  const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #000; overflow: hidden; }
      iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; }
    </style>
  </head>
  <body>
    <iframe
      src="${embedUrl}"
      title="${title}"
      allow="autoplay; fullscreen; picture-in-picture"
      allowfullscreen
    ></iframe>
    ${playListenerScript}
  </body>
</html>`;

  return { html, baseUrl };
}

export function buildVimeoEmbedSource(
  url: string,
  options: EmbedHtmlOptions = {},
): { html: string; baseUrl: string } {
  const { autoplay = false, notifyOnPlay = false } = options;
  const embedUrl = new URL(url);
  embedUrl.searchParams.set('playsinline', autoplay ? '0' : '1');
  if (autoplay) {
    embedUrl.searchParams.set('autoplay', '1');
  }
  return buildIframeEmbedHtml(embedUrl.href, 'https://player.vimeo.com', {
    notifyOnPlay,
    title: 'Vimeo video',
  });
}
