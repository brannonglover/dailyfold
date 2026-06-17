import type { ColorScheme } from '@/constants/Colors';
import type { WorldCupBroadcast, WorldCupMatch } from '@/services/worldCupFeed';

/** Supplementary World Cup accents layered on top of the app theme. */
export function worldCupAccentColors(scheme: ColorScheme) {
  if (scheme === 'dark') {
    return {
      gold: '#E8C547',
      goldMuted: '#3D3520',
      pitch: '#2D8B55',
      pitchMuted: '#1A3328',
      liveGlow: '#FF7A6B',
      headerGradient: ['#2A1816', '#1A3328', '#121212'] as const,
      cardLiveGradient: ['#3D2522', '#1E1E1E'] as const,
    };
  }

  return {
    gold: '#C9A227',
    goldMuted: '#FBF5E0',
    pitch: '#1A6B3C',
    pitchMuted: '#E8F5EE',
    liveGlow: '#E85D4C',
    headerGradient: ['#FCEAE8', '#E8F5EE', '#FAF9F7'] as const,
    cardLiveGradient: ['#FFF5F4', '#FFFFFF'] as const,
  };
}

export function matchWentToPenalties(match: WorldCupMatch): boolean {
  return match.wentToPenalties === true;
}

export function hasPenaltyShootoutScores(match: WorldCupMatch): boolean {
  return !!match.penaltyShootout;
}

/** Regulation score only (excludes penalty shootout). */
export function formatRegulationScore(match: WorldCupMatch): string {
  return `${match.home.score} – ${match.away.score}`;
}

/** Penalty shootout line, e.g. "3–4 pens". */
export function formatPenaltyShootoutLine(match: WorldCupMatch): string | null {
  const pens = match.penaltyShootout;
  if (!pens) return null;
  return `${pens.home}–${pens.away} pens`;
}

/** Full score line for cards and headers. */
export function formatMatchScoreDisplay(match: WorldCupMatch): {
  main: string;
  penaltyLine: string | null;
} {
  const main = formatRegulationScore(match);
  const penaltyLine = matchWentToPenalties(match) ? formatPenaltyShootoutLine(match) : null;
  return { main, penaltyLine };
}

export function penaltyStatusLabel(match: WorldCupMatch): string | null {
  if (!matchWentToPenalties(match)) return null;
  if (hasPenaltyShootoutScores(match)) return 'After penalties';
  return 'Penalties';
}

export function hasMatchBroadcasts(match: WorldCupMatch): boolean {
  return (match.broadcasts?.length ?? 0) > 0;
}

/** Show broadcast info on live fixtures and upcoming kickoffs only. */
export function shouldShowMatchBroadcasts(match: WorldCupMatch): boolean {
  return hasMatchBroadcasts(match) && (match.isLive || !match.isFinal);
}

export function formatBroadcastNames(broadcasts: WorldCupBroadcast[]): string {
  return broadcasts.map((broadcast) => broadcast.name).join(' · ');
}

export function groupBroadcastsByType(
  broadcasts: WorldCupBroadcast[],
): { tv: WorldCupBroadcast[]; streaming: WorldCupBroadcast[]; other: WorldCupBroadcast[] } {
  const tv: WorldCupBroadcast[] = [];
  const streaming: WorldCupBroadcast[] = [];
  const other: WorldCupBroadcast[] = [];

  for (const broadcast of broadcasts) {
    if (broadcast.type === 'tv') tv.push(broadcast);
    else if (broadcast.type === 'streaming') streaming.push(broadcast);
    else other.push(broadcast);
  }

  return { tv, streaming, other };
}
