import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { WorldCupMatch } from '@/services/worldCupFeed';
import {
  formatMatchScoreDisplay,
  matchWentToPenalties,
  penaltyStatusLabel,
  worldCupAccentColors,
} from '@/utils/worldCupMatchDisplay';

export function WorldCupHeroStrip() {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  return (
    <LinearGradient
      colors={[...accents.headerGradient]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.heroStrip, { borderBottomColor: colors.border }]}>
      <View style={[styles.heroBadge, { backgroundColor: accents.goldMuted }]}>
        <Ionicons name="football" size={14} color={accents.gold} />
        <Text style={[styles.heroBadgeText, { color: accents.pitch }]}>FIFA World Cup 2026</Text>
      </View>
      <Text style={[styles.heroTagline, { color: colors.textSecondary }]}>
        Live scores, bracket, and tournament news
      </Text>
    </LinearGradient>
  );
}

export function WorldCupLiveBadge() {
  const { colors } = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={[styles.liveBadge, { backgroundColor: colors.accentMuted }]}>
      <Animated.View style={[styles.liveDot, { backgroundColor: colors.accent, opacity: pulse }]} />
      <Text style={[styles.liveBadgeText, { color: colors.accent }]}>Live</Text>
    </View>
  );
}

export function WorldCupStatusBadge({ match }: { match: WorldCupMatch }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  if (match.isLive) return <WorldCupLiveBadge />;

  const penaltyLabel = penaltyStatusLabel(match);
  if (penaltyLabel) {
    return (
      <View style={[styles.statusBadge, { backgroundColor: accents.goldMuted }]}>
        <Ionicons name="football-outline" size={12} color={accents.gold} />
        <Text style={[styles.statusBadgeText, { color: accents.gold }]}>{penaltyLabel}</Text>
      </View>
    );
  }

  if (match.isFinal) {
    return (
      <View style={[styles.statusBadge, { backgroundColor: accents.pitchMuted }]}>
        <Text style={[styles.statusBadgeText, { color: accents.pitch }]}>Final</Text>
      </View>
    );
  }

  return (
    <Text style={[styles.plainStatus, { color: colors.textSecondary }]}>{match.status}</Text>
  );
}

export function WorldCupMatchScore({
  match,
  size = 'card',
}: {
  match: WorldCupMatch;
  size?: 'card' | 'compact' | 'hero';
}) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const { main, penaltyLine } = formatMatchScoreDisplay(match);

  const mainStyle =
    size === 'hero'
      ? styles.heroScore
      : size === 'compact'
        ? styles.compactScore
        : styles.cardScore;

  return (
    <View style={styles.scoreBlock}>
      <Text style={[mainStyle, { color: colors.text }]}>{main}</Text>
      {penaltyLine ? (
        <View style={[styles.penaltyPill, { backgroundColor: accents.goldMuted }]}>
          <Ionicons name="football-outline" size={11} color={accents.gold} />
          <Text style={[styles.penaltyPillText, { color: accents.gold }]}>{penaltyLine}</Text>
        </View>
      ) : matchWentToPenalties(match) ? (
        <Text style={[styles.penaltyPending, { color: colors.textSecondary }]}>Penalties TBD</Text>
      ) : null}
    </View>
  );
}

export function WorldCupTeamScore({
  team,
  match,
  align,
}: {
  team: WorldCupMatch['home'];
  match: WorldCupMatch;
  align: 'left' | 'right';
}) {
  const { colors } = useTheme();
  const showPenaltyScore = match.penaltyShootout && match.wentToPenalties;
  const penaltyScore =
    align === 'left' ? match.penaltyShootout?.home : match.penaltyShootout?.away;

  return (
    <View style={align === 'right' ? styles.scoreAlignRight : undefined}>
      <Text
        style={[
          styles.teamScoreValue,
          { color: team.winner ? colors.accent : colors.text },
          align === 'right' && styles.textRight,
        ]}>
        {team.score}
      </Text>
      {showPenaltyScore ? (
        <Text
          style={[
            styles.teamPenaltyScore,
            { color: team.winner ? colors.accent : colors.textSecondary },
            align === 'right' && styles.textRight,
          ]}>
          ({penaltyScore})
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  heroStrip: {
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeText: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    letterSpacing: 0.2,
  },
  heroTagline: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveBadgeText: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  statusBadgeText: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  plainStatus: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scoreBlock: {
    alignItems: 'center',
    gap: 4,
  },
  cardScore: {
    fontFamily: 'LoraBold',
    fontSize: 28,
    lineHeight: 32,
  },
  compactScore: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    lineHeight: 16,
  },
  heroScore: {
    fontFamily: 'LoraBold',
    fontSize: 32,
    lineHeight: 36,
  },
  penaltyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  penaltyPillText: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    letterSpacing: 0.2,
  },
  penaltyPending: {
    fontFamily: 'Inter',
    fontSize: 11,
  },
  teamScoreValue: {
    fontFamily: 'LoraBold',
    fontSize: 28,
    lineHeight: 32,
  },
  teamPenaltyScore: {
    fontFamily: 'InterMedium',
    fontSize: 12,
    lineHeight: 16,
  },
  scoreAlignRight: {
    alignItems: 'flex-end',
  },
  textRight: {
    textAlign: 'right',
  },
});
