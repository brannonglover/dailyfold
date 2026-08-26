/** Injected into publisher and Reader WebViews to report scroll depth to React Native. */
export const WEBVIEW_READ_PROGRESS_INJECT_JS = `(function() {
  if (window.__dailyfoldReadProgress) return true;
  window.__dailyfoldReadProgress = true;
  var maxPercent = 0;
  function report() {
    if (!window.ReactNativeWebView) return;
    var scrollTop = window.pageYOffset || document.documentElement.scrollTop || 0;
    var viewport = window.innerHeight || document.documentElement.clientHeight || 0;
    var scrollHeight = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    if (scrollTop <= 0 && scrollHeight > viewport) return;
    var readPercent = 0;
    if (scrollHeight <= viewport) {
      readPercent = scrollTop > 0 ? 100 : 0;
    } else {
      readPercent = Math.min(100, ((scrollTop + viewport) / scrollHeight) * 100);
    }
    if (readPercent <= 0 || readPercent <= maxPercent) return;
    maxPercent = readPercent;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'readProgress',
      readPercent: Math.round(maxPercent),
    }));
  }
  window.addEventListener('scroll', report, { passive: true });
})();true;`;

export function readProgressScriptTag(): string {
  return `<script>${WEBVIEW_READ_PROGRESS_INJECT_JS.replace(/<\//g, '<\\/')}</script>`;
}
