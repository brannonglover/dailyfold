import Svg, { Polygon } from 'react-native-svg';

interface FoldTicksProps {
  width: number;
  height?: number;
  color?: string;
  opacity?: number;
}

/**
 * Design units from the reference strip: each tick is a parallelogram ~7×6
 * with a ~6px gap and a ~3px top skew (leaning / ). Everything scales from
 * `height` so the strip tracks the image size.
 */
const REF_TICK_HEIGHT = 6;
const REF_PERIOD = 13;
const REF_STRIPE = 7;
const REF_SKEW = 3;
/** Skip ticks shorter than this (avoids hairline dots on the far left). */
const MIN_TICK_HEIGHT = 1.5;

/**
 * FoldTicks — evenly spaced parallelogram dashes along the bottom of every
 * photo, matching the dailyfold fold-line motif. Ticks ramp from small on
 * the left to full size on the right. Width fills the image; height (and
 * thus dash size/spacing) scales with the image.
 */
export function FoldTicks({
  width,
  height = 12,
  color = '#E67A56',
  opacity = 1,
}: FoldTicksProps) {
  const scale = height / REF_TICK_HEIGHT;
  const period = REF_PERIOD * scale;
  const stripe = REF_STRIPE * scale;
  const skew = REF_SKEW * scale;

  const count = Math.max(1, Math.ceil(width / period) + 1);
  const ticks: string[] = [];

  for (let i = 0; i < count; i++) {
    const x = i * period;
    // 0 at the left edge → 1 at the right: grows small → full size.
    const progress = Math.min(1, Math.max(0, (x + period * 0.5) / width));
    const tickH = height * progress;
    if (tickH < MIN_TICK_HEIGHT) continue;

    // Keep the / lean angle constant as height changes.
    const tickSkew = skew * (tickH / height);
    const top = height - tickH;

    ticks.push(
      [
        `${x + tickSkew},${top}`,
        `${x + tickSkew + stripe},${top}`,
        `${x + stripe},${height}`,
        `${x},${height}`,
      ].join(' '),
    );
  }

  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none">
      {ticks.map((points, i) => (
        <Polygon key={i} points={points} fill={color} opacity={opacity} />
      ))}
    </Svg>
  );
}
