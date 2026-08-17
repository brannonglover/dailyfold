export function chipCenterScrollOffset(
  contentOffset: number,
  chipWindowX: number,
  chipWidth: number,
  scrollWindowX: number,
  viewportWidth: number,
): number {
  if (viewportWidth <= 0 || chipWidth <= 0) return Math.max(0, contentOffset);
  return Math.max(
    0,
    contentOffset + (chipWindowX + chipWidth / 2) - (scrollWindowX + viewportWidth / 2),
  );
}
