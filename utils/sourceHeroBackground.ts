import type Colors from '@/constants/Colors';

type ThemeColors = (typeof Colors)[keyof typeof Colors];

function hashSourceName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Muted, source-specific gradient for logo hero fallbacks. */
export function sourceHeroGradientColors(
  sourceName: string,
  colors: ThemeColors,
  isDark: boolean,
): readonly [string, string, string] {
  const hue = hashSourceName(sourceName.trim() || 'source') % 360;

  if (isDark) {
    return [
      `hsla(${hue}, 32%, 24%, 1)`,
      `hsla(${hue}, 26%, 17%, 1)`,
      colors.background,
    ] as const;
  }

  return [
    `hsla(${hue}, 42%, 93%, 1)`,
    `hsla(${hue}, 34%, 88%, 1)`,
    colors.background,
  ] as const;
}
