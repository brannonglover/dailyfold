/**
 * Run work after the current frame can paint, without waiting for scroll gestures to end.
 * rAF → setTimeout(0) yields to the renderer before running heavier work.
 */
export function deferAfterPaint(work: () => void): () => void {
  let cancelled = false;
  let frame = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const run = () => {
    if (!cancelled) work();
  };

  if (typeof requestAnimationFrame === 'function') {
    frame = requestAnimationFrame(() => {
      if (cancelled) return;
      timer = setTimeout(run, 0);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (timer !== undefined) clearTimeout(timer);
    };
  }

  timer = setTimeout(run, 0);
  return () => {
    cancelled = true;
    clearTimeout(timer);
  };
}
