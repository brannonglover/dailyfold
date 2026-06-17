import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import { WorldCupBroadcastSection } from '@/components/WorldCupBroadcastInfo';
import {
  fetchWorldCupMatchSummary,
  WorldCupHalfScore,
  WorldCupMatch,
  WorldCupMatchEvent,
  WorldCupPenaltyShootout,
  WorldCupTeamStats,
} from '@/services/worldCupFeed';
import {
  worldCupAccentColors,
} from '@/utils/worldCupMatchDisplay';
import { WorldCupMatchScore, WorldCupStatusBadge } from '@/components/WorldCupMatchScore';

interface WorldCupMatchDetailModalProps {
  match: WorldCupMatch | null;
  visible: boolean;
  onClose: () => void;
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function eventIconName(event: WorldCupMatchEvent): keyof typeof Ionicons.glyphMap {
  if (event.type.toLowerCase().includes('goal')) return 'football';
  if (event.type.toLowerCase().includes('red')) return 'square';
  return 'square-outline';
}

function eventIconColor(
  event: WorldCupMatchEvent,
  colors: ReturnType<typeof useTheme>['colors'],
): string {
  if (event.type.toLowerCase().includes('red')) return '#dc2626';
  if (event.type.toLowerCase().includes('yellow')) return '#ca8a04';
  return colors.accent;
}

function eventDescription(event: WorldCupMatchEvent): string {
  const suffixes: string[] = [];
  if (event.isPenalty) suffixes.push('pen');
  if (event.isOwnGoal) suffixes.push('OG');
  if (event.isShootout) suffixes.push('shootout');

  const base = event.playerName ? `${event.type} · ${event.playerName}` : event.type;
  return suffixes.length > 0 ? `${base} (${suffixes.join(', ')})` : base;
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.sectionCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Ionicons name={icon} size={15} color={colors.accent} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function EmptySectionCard({
  title,
  icon,
  message,
}: {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  message: string;
}) {
  const { colors } = useTheme();

  return (
    <SectionCard title={title} icon={icon}>
      <View style={[styles.emptyState, { backgroundColor: colors.accentMuted }]}>
        <Ionicons name={icon} size={20} color={colors.accent} />
        <Text style={[styles.emptySectionText, { color: colors.textSecondary }]}>{message}</Text>
      </View>
    </SectionCard>
  );
}

function TeamLogo({
  team,
  size,
}: {
  team: WorldCupMatch['home'];
  size: number;
}) {
  const { colors } = useTheme();

  if (team.logoUrl) {
    return (
      <Image
        source={{ uri: team.logoUrl }}
        style={{ width: size, height: size }}
        contentFit="contain"
      />
    );
  }

  return (
    <View
      style={[
        styles.teamLogoFallback,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.border,
        },
      ]}>
      <Text style={[styles.teamLogoAbbrev, { color: colors.text, fontSize: size * 0.3 }]}>
        {team.abbrev}
      </Text>
    </View>
  );
}

function ScoreHeader({ match, onClose }: { match: WorldCupMatch; onClose: () => void }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  return (
    <LinearGradient
      colors={match.isLive ? [...accents.cardLiveGradient] : [colors.surface, colors.surface]}
      style={[
        styles.headerCard,
        { borderColor: colors.border },
        match.isLive && { borderColor: colors.accent },
        match.wentToPenalties && !match.isLive && { borderLeftColor: accents.gold, borderLeftWidth: 3 },
      ]}>
      <View style={styles.headerTopRow}>
        <WorldCupStatusBadge match={match} />
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close match details">
          <Ionicons name="close" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.scoreboardRow}>
        <View style={styles.scoreboardTeam}>
          <TeamLogo team={match.home} size={40} />
          <Text
            style={[
              styles.scoreboardName,
              { color: match.home.winner ? colors.accent : colors.text },
            ]}
            numberOfLines={2}>
            {match.home.name}
          </Text>
          <Text style={[styles.scoreboardAbbrev, { color: colors.textSecondary }]}>
            {match.home.abbrev}
          </Text>
        </View>

        <View style={styles.scoreboardCenter}>
          <WorldCupMatchScore match={match} size="hero" />
        </View>

        <View style={[styles.scoreboardTeam, styles.scoreboardTeamRight]}>
          <TeamLogo team={match.away} size={40} />
          <Text
            style={[
              styles.scoreboardName,
              styles.textRight,
              { color: match.away.winner ? colors.accent : colors.text },
            ]}
            numberOfLines={2}>
            {match.away.name}
          </Text>
          <Text style={[styles.scoreboardAbbrev, styles.textRight, { color: colors.textSecondary }]}>
            {match.away.abbrev}
          </Text>
        </View>
      </View>

      <View style={[styles.headerMetaRow, { borderTopColor: colors.border }]}>
        <Ionicons name="time-outline" size={14} color={colors.textSecondary} />
        <Text style={[styles.metaLine, { color: colors.textSecondary }]}>
          {formatKickoff(match.startTime)}
          {match.venue ? ` · ${match.venue}` : ''}
        </Text>
      </View>
    </LinearGradient>
  );
}

function StatRow({
  label,
  home,
  away,
}: {
  label: string;
  home?: string;
  away?: string;
}) {
  const { colors } = useTheme();
  if (!home && !away) return null;

  return (
    <View style={[styles.statRow, { borderBottomColor: colors.border }]}>
      <Text style={[styles.statValue, { color: colors.text }]}>{home ?? '—'}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, styles.statValueRight, { color: colors.text }]}>
        {away ?? '—'}
      </Text>
    </View>
  );
}

function StatTable({
  homeAbbrev,
  awayAbbrev,
  children,
}: {
  homeAbbrev: string;
  awayAbbrev: string;
  children: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <>
      <View style={styles.statHeaderRow}>
        <Text style={[styles.statHeader, { color: colors.textSecondary }]}>{homeAbbrev}</Text>
        <View style={styles.statHeaderSpacer} />
        <Text style={[styles.statHeader, styles.textRight, { color: colors.textSecondary }]}>
          {awayAbbrev}
        </Text>
      </View>
      {children}
    </>
  );
}

function MatchStatsSection({
  homeAbbrev,
  awayAbbrev,
  stats,
}: {
  homeAbbrev: string;
  awayAbbrev: string;
  stats: { home: WorldCupTeamStats; away: WorldCupTeamStats };
}) {
  return (
    <SectionCard title="Match stats" icon="stats-chart-outline">
      <StatTable homeAbbrev={homeAbbrev} awayAbbrev={awayAbbrev}>
        <StatRow label="Possession" home={stats.home.possession} away={stats.away.possession} />
        <StatRow label="Shots" home={stats.home.shots} away={stats.away.shots} />
        <StatRow
          label="On target"
          home={stats.home.shotsOnTarget}
          away={stats.away.shotsOnTarget}
        />
        <StatRow label="Fouls" home={stats.home.fouls} away={stats.away.fouls} />
        <StatRow label="Corners" home={stats.home.corners} away={stats.away.corners} />
      </StatTable>
    </SectionCard>
  );
}

function HalfScoresSection({
  homeAbbrev,
  awayAbbrev,
  halfScores,
}: {
  homeAbbrev: string;
  awayAbbrev: string;
  halfScores: WorldCupHalfScore[];
}) {
  return (
    <SectionCard title="Half-time scores" icon="hourglass-outline">
      <StatTable homeAbbrev={homeAbbrev} awayAbbrev={awayAbbrev}>
        {halfScores.map((half, index) => (
          <StatRow
            key={half.label}
            label={half.label}
            home={half.home}
            away={half.away}
          />
        ))}
      </StatTable>
    </SectionCard>
  );
}

function PenaltyShootoutSection({
  match,
  penaltyShootout,
}: {
  match: WorldCupMatch;
  penaltyShootout: WorldCupPenaltyShootout;
}) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const shootoutEvents = (match.events ?? []).filter((event) => event.isShootout);

  return (
    <SectionCard title="Penalty shootout" icon="football">
      <View style={[styles.penaltySummaryRow, { backgroundColor: accents.goldMuted }]}>
        <Text style={[styles.penaltySummaryTeam, { color: colors.text }]}>{match.home.abbrev}</Text>
        <Text style={[styles.penaltySummaryScore, { color: accents.gold }]}>
          {penaltyShootout.home} – {penaltyShootout.away}
        </Text>
        <Text style={[styles.penaltySummaryTeam, styles.textRight, { color: colors.text }]}>
          {match.away.abbrev}
        </Text>
      </View>
      {shootoutEvents.length > 0 ? (
        <View style={styles.penaltyEventList}>
          {shootoutEvents.map((event, index) => {
            const teamName = event.side === 'home' ? match.home.name : match.away.name;
            const scored = event.type.toLowerCase().includes('scored');
            return (
              <View key={`${event.clock}-${event.type}-${index}`} style={styles.penaltyEventRow}>
                <Ionicons
                  name={scored ? 'checkmark-circle' : 'close-circle'}
                  size={14}
                  color={scored ? accents.pitch : colors.textSecondary}
                />
                <Text style={[styles.penaltyEventText, { color: colors.text }]}>
                  {event.playerName ?? event.type}
                </Text>
                <Text style={[styles.penaltyEventTeam, { color: colors.textSecondary }]}>
                  {teamName}
                </Text>
              </View>
            );
          })}
        </View>
      ) : null}
    </SectionCard>
  );
}

function TimelineSection({
  match,
  events,
}: {
  match: WorldCupMatch;
  events: WorldCupMatchEvent[];
}) {
  const { colors } = useTheme();

  return (
    <SectionCard title="Timeline" icon="list-outline">
      {events.map((event, index) => {
        const teamName = event.side === 'home' ? match.home.name : match.away.name;
        const isLast = index === events.length - 1;

        return (
          <View
            key={`${event.clock}-${event.type}-${index}`}
            style={[
              styles.eventRow,
              !isLast && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}>
            <Text style={[styles.eventClock, { color: colors.textSecondary }]}>{event.clock}</Text>
            <Ionicons
              name={eventIconName(event)}
              size={14}
              color={eventIconColor(event, colors)}
            />
            <View style={styles.eventBody}>
              <Text style={[styles.eventText, { color: colors.text }]}>
                {eventDescription(event)}
              </Text>
              <Text style={[styles.eventTeam, { color: colors.textSecondary }]}>{teamName}</Text>
            </View>
          </View>
        );
      })}
    </SectionCard>
  );
}

export function WorldCupMatchDetailModal({
  match,
  visible,
  onClose,
}: WorldCupMatchDetailModalProps) {
  const { colors } = useTheme();
  const [halfScores, setHalfScores] = useState<WorldCupHalfScore[]>([]);
  const [summaryPenaltyShootout, setSummaryPenaltyShootout] = useState<
    WorldCupPenaltyShootout | undefined
  >(undefined);
  const [halfScoresError, setHalfScoresError] = useState<string | null>(null);
  const [isLoadingHalfScores, setIsLoadingHalfScores] = useState(false);

  useEffect(() => {
    if (!visible || !match) {
      setHalfScores([]);
      setSummaryPenaltyShootout(undefined);
      setHalfScoresError(null);
      setIsLoadingHalfScores(false);
      return;
    }

    if (!match.isFinal && !match.isLive) {
      setHalfScores([]);
      setSummaryPenaltyShootout(undefined);
      setHalfScoresError(null);
      setIsLoadingHalfScores(false);
      return;
    }

    let cancelled = false;
    setIsLoadingHalfScores(true);
    setHalfScoresError(null);

    void fetchWorldCupMatchSummary(match.id)
      .then((summary) => {
        if (cancelled) return;
        setHalfScores(summary.halfScores);
        setSummaryPenaltyShootout(summary.penaltyShootout);
      })
      .catch((error) => {
        if (cancelled) return;
        setHalfScores([]);
        setSummaryPenaltyShootout(undefined);
        setHalfScoresError(
          error instanceof Error ? error.message : 'Could not load half-time scores',
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHalfScores(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, match]);

  if (!match) return null;

  const events = match.events ?? [];
  const regulationEvents = events.filter((event) => !event.isShootout);
  const hasTimeline = regulationEvents.length > 0;
  const hasStats = !!match.teamStats;
  const showHalfScores = match.isFinal || match.isLive;
  const penaltyShootout = summaryPenaltyShootout ?? match.penaltyShootout;
  const displayMatch: WorldCupMatch =
    penaltyShootout && !match.penaltyShootout ? { ...match, penaltyShootout } : match;
  const showPenaltySection = displayMatch.wentToPenalties && !!penaltyShootout;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            { backgroundColor: colors.background, borderColor: colors.border },
          ]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <ScrollView
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
            nestedScrollEnabled>
            <ScoreHeader match={displayMatch} onClose={onClose} />

            <WorldCupBroadcastSection match={displayMatch} />

            {showPenaltySection && penaltyShootout ? (
              <PenaltyShootoutSection match={displayMatch} penaltyShootout={penaltyShootout} />
            ) : displayMatch.wentToPenalties ? (
              <EmptySectionCard
                title="Penalty shootout"
                icon="football-outline"
                message="Penalty shootout scores not available yet."
              />
            ) : null}

            {showHalfScores &&
              (isLoadingHalfScores ? (
                <SectionCard title="Half-time scores" icon="hourglass-outline">
                  <ActivityIndicator color={colors.textSecondary} style={styles.halfScoresLoader} />
                </SectionCard>
              ) : halfScores.length > 0 ? (
                <HalfScoresSection
                  homeAbbrev={match.home.abbrev}
                  awayAbbrev={match.away.abbrev}
                  halfScores={halfScores}
                />
              ) : halfScoresError ? (
                <EmptySectionCard
                  title="Half-time scores"
                  icon="hourglass-outline"
                  message="Half-time scores unavailable."
                />
              ) : null)}

            {hasTimeline ? (
              <TimelineSection match={displayMatch} events={regulationEvents} />
            ) : (
              <EmptySectionCard
                title="Timeline"
                icon="football-outline"
                message={
                  match.isFinal || match.isLive
                    ? 'No timeline events reported yet.'
                    : 'Match has not started yet.'
                }
              />
            )}

            {hasStats && match.teamStats ? (
              <MatchStatsSection
                homeAbbrev={match.home.abbrev}
                awayAbbrev={match.away.abbrev}
                stats={match.teamStats}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheet: {
    width: '100%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: Platform.OS === 'web' ? '80%' : '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 12,
  },
  headerCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  scoreboardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  scoreboardTeam: {
    flex: 1,
    alignItems: 'flex-start',
    gap: 4,
  },
  scoreboardTeamRight: {
    alignItems: 'flex-end',
  },
  scoreboardCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 4,
    minWidth: 88,
  },
  scoreboardName: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    lineHeight: 17,
  },
  scoreboardAbbrev: {
    fontFamily: 'InterMedium',
    fontSize: 11,
  },
  headerScore: {
    fontFamily: 'LoraBold',
    fontSize: 28,
    lineHeight: 32,
  },
  statusLine: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginTop: 4,
    textAlign: 'center',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  metaLine: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 17,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    gap: 12,
    paddingBottom: 12,
  },
  sectionCard: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sectionTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionBody: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  statHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statHeader: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 11,
    textTransform: 'uppercase',
  },
  statHeaderSpacer: {
    width: 88,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  statValue: {
    flex: 1,
    fontFamily: 'InterSemiBold',
    fontSize: 14,
  },
  statValueRight: {
    textAlign: 'right',
  },
  statLabel: {
    width: 88,
    fontFamily: 'Inter',
    fontSize: 12,
    textAlign: 'center',
  },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  eventClock: {
    width: 36,
    fontFamily: 'InterMedium',
    fontSize: 12,
  },
  eventBody: {
    flex: 1,
    gap: 2,
  },
  eventText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
    lineHeight: 18,
  },
  eventTeam: {
    fontFamily: 'Inter',
    fontSize: 12,
  },
  emptyState: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptySectionText: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 14,
    lineHeight: 20,
  },
  halfScoresLoader: {
    paddingVertical: 8,
  },
  penaltySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  penaltySummaryTeam: {
    flex: 1,
    fontFamily: 'InterSemiBold',
    fontSize: 13,
  },
  penaltySummaryScore: {
    fontFamily: 'LoraBold',
    fontSize: 24,
    lineHeight: 28,
    textAlign: 'center',
    minWidth: 88,
  },
  penaltyEventList: {
    gap: 6,
  },
  penaltyEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  penaltyEventText: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
  penaltyEventTeam: {
    fontFamily: 'Inter',
    fontSize: 12,
  },
  teamLogoFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamLogoAbbrev: {
    fontFamily: 'InterSemiBold',
  },
  textRight: {
    textAlign: 'right',
  },
});
