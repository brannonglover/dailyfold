import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedHeader } from '@/components/FeedHeader';
import { WorldCupBroadcastCompact } from '@/components/WorldCupBroadcastInfo';
import { WorldCupMatchDetailModal } from '@/components/WorldCupMatchDetailModal';
import {
  WorldCupHeroStrip,
  WorldCupStatusBadge,
  WorldCupTeamScore,
} from '@/components/WorldCupMatchScore';
import { WorldCupTab, WorldCupTabBar } from '@/components/WorldCupTabBar';
import { WORLD_CUP_GROUP_CARD_MIN_HEIGHT } from '@/constants/Layout';
import {
  WORLD_CUP_KNOCKOUT_COLUMN_WIDTH,
  WORLD_CUP_LIVE_POLL_INTERVAL_MS,
  WORLD_CUP_TAB_ENABLED,
} from '@/constants/worldCup';
import { useTheme } from '@/hooks/useTheme';
import {
  fetchWorldCupFeed,
  filterMatchesByStage,
  groupMatchesByKickoffDate,
  hasLiveMatches,
  partitionMatchesForScores,
  WorldCupBracketRound,
  WorldCupGroup,
  WorldCupGroupTeam,
  WorldCupMatch,
  WorldCupScoresStageFilter,
  WorldCupUpdate,
} from '@/services/worldCupFeed';
import { openPublisherArticle } from '@/utils/openPublisherBrowser';
import { worldCupAccentColors } from '@/utils/worldCupMatchDisplay';

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function MatchCard({ match, onPress }: { match: WorldCupMatch; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const cardContent = (
    <>
      <View style={styles.matchMetaRow}>
        <WorldCupStatusBadge match={match} />
        {match.statusDetail ? (
          <Text style={[styles.matchDetail, { color: colors.textSecondary }]} numberOfLines={1}>
            {match.statusDetail}
          </Text>
        ) : null}
      </View>

      <View style={styles.teamsRow}>
        <TeamColumn team={match.home} match={match} align="left" />
        <Text style={[styles.scoreDivider, { color: colors.textSecondary }]}>vs</Text>
        <TeamColumn team={match.away} match={match} align="right" />
      </View>

      <Text style={[styles.kickoff, { color: colors.textSecondary }]}>
        {formatKickoff(match.startTime)}
        {match.venue ? ` · ${match.venue}` : ''}
      </Text>

      <WorldCupBroadcastCompact match={match} />
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${match.home.name} vs ${match.away.name}, ${match.home.score} to ${match.away.score}`}
      accessibilityHint="Shows match breakdown"
      style={({ pressed }) => [pressed && { opacity: 0.75 }]}>
      {match.isLive ? (
        <LinearGradient
          colors={[...accents.cardLiveGradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.matchCard,
            { borderColor: colors.accent },
            styles.matchCardAccent,
            { borderLeftColor: colors.accent },
          ]}>
          {cardContent}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.matchCard,
            { backgroundColor: colors.surface, borderColor: colors.border },
            match.wentToPenalties && { borderLeftColor: accents.gold, borderLeftWidth: 3 },
          ]}>
          {cardContent}
        </View>
      )}
    </Pressable>
  );
}

function BracketMatchCard({ match, onPress }: { match: WorldCupMatch; onPress: () => void }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${match.home.name} vs ${match.away.name}`}
      accessibilityHint="Shows match breakdown"
      style={({ pressed }) => [
        styles.bracketMatchCard,
        {
          backgroundColor: match.isLive ? colors.accentMuted : colors.surface,
          borderColor: match.isLive ? colors.accent : colors.border,
        },
        match.wentToPenalties && !match.isLive && { borderLeftColor: accents.gold, borderLeftWidth: 3 },
        pressed && { opacity: 0.75 },
      ]}>
      <View style={styles.bracketTeamRow}>
        <BracketTeamLine team={match.home} side="home" match={match} colors={colors} />
        <BracketTeamLine team={match.away} side="away" match={match} colors={colors} />
      </View>
      <View style={styles.bracketFooterRow}>
        <WorldCupStatusBadge match={match} />
        {match.statusDetail ? (
          <Text style={[styles.bracketKickoff, { color: colors.textSecondary }]} numberOfLines={1}>
            {match.statusDetail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function BracketTeamLine({
  team,
  side,
  match,
  colors,
}: {
  team: WorldCupMatch['home'];
  side: 'home' | 'away';
  match: WorldCupMatch;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  const penaltyScore =
    side === 'home' ? match.penaltyShootout?.home : match.penaltyShootout?.away;

  return (
    <View style={styles.bracketTeamLine}>
      {team.logoUrl ? (
        <Image source={{ uri: team.logoUrl }} style={styles.bracketLogo} contentFit="contain" />
      ) : (
        <View style={[styles.bracketLogoFallback, { backgroundColor: colors.border }]}>
          <Text style={[styles.bracketAbbrev, { color: colors.text }]}>{team.abbrev}</Text>
        </View>
      )}
      <Text
        style={[
          styles.bracketTeamName,
          { color: team.winner ? colors.accent : colors.text },
        ]}
        numberOfLines={1}>
        {team.name}
      </Text>
      <View style={styles.bracketScoreCell}>
        <Text
          style={[
            styles.bracketTeamScore,
            { color: team.winner ? colors.accent : colors.textSecondary },
          ]}>
          {team.score}
        </Text>
        {match.wentToPenalties && penaltyScore ? (
          <Text
            style={[
              styles.bracketPenaltyScore,
              { color: team.winner ? colors.accent : colors.textSecondary },
            ]}>
            ({penaltyScore})
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function GroupStandingsCard({ group }: { group: WorldCupGroup }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  return (
    <View
      style={[
        styles.groupCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          minHeight: WORLD_CUP_GROUP_CARD_MIN_HEIGHT,
        },
      ]}>
      <View style={[styles.groupTitleRow, { borderBottomColor: colors.border }]}>
        <View style={[styles.groupTitleBadge, { backgroundColor: accents.pitchMuted }]}>
          <Text style={[styles.groupTitle, { color: accents.pitch }]}>{group.name}</Text>
        </View>
      </View>
      <View style={styles.groupHeaderRow}>
        <Text style={[styles.groupHeaderCell, styles.groupTeamCell, { color: colors.textSecondary }]}>
          Team
        </Text>
        <Text style={[styles.groupHeaderCell, { color: colors.textSecondary }]}>P</Text>
        <Text style={[styles.groupHeaderCell, { color: colors.textSecondary }]}>GD</Text>
        <Text style={[styles.groupHeaderCell, { color: colors.textSecondary }]}>Pts</Text>
      </View>
      {group.teams.map((team, index) => (
        <GroupTeamRow key={`${group.name}-${team.abbrev}`} team={team} rank={index + 1} />
      ))}
    </View>
  );
}

function GroupTeamRow({ team, rank }: { team: WorldCupGroupTeam; rank: number }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const advances = rank <= 2;

  return (
    <View
      style={[
        styles.groupTeamRow,
        advances && { backgroundColor: accents.goldMuted, borderRadius: 8, paddingVertical: 2 },
      ]}>
      <View style={styles.groupTeamCell}>
        {team.logoUrl ? (
          <Image source={{ uri: team.logoUrl }} style={styles.groupLogo} contentFit="contain" />
        ) : (
          <View style={[styles.groupLogoFallback, { backgroundColor: colors.border }]}>
            <Text style={[styles.groupAbbrev, { color: colors.text }]}>{team.abbrev}</Text>
          </View>
        )}
        <Text
          style={[
            styles.groupTeamName,
            { color: advances ? colors.accent : colors.text },
          ]}
          numberOfLines={1}>
          {team.abbrev}
        </Text>
      </View>
      <Text style={[styles.groupStat, { color: colors.textSecondary }]}>{team.played}</Text>
      <Text style={[styles.groupStat, { color: colors.textSecondary }]}>
        {team.goalDiff > 0 ? `+${team.goalDiff}` : team.goalDiff}
      </Text>
      <Text style={[styles.groupStat, { color: colors.text, fontFamily: 'InterSemiBold' }]}>
        {team.points}
      </Text>
    </View>
  );
}

function GroupStandingsGrid({ groups }: { groups: WorldCupGroup[] }) {
  const { colors } = useTheme();

  if (groups.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        Group standings not available yet.
      </Text>
    );
  }

  return (
    <View style={styles.groupGrid}>
      {groups.map((group) => (
        <GroupStandingsCard key={group.name} group={group} />
      ))}
    </View>
  );
}

function BracketView({
  groups,
  rounds,
  onSelectMatch,
}: {
  groups: WorldCupGroup[];
  rounds: WorldCupBracketRound[];
  onSelectMatch: (match: WorldCupMatch) => void;
}) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  if (groups.length === 0 && rounds.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        Bracket not available yet.
      </Text>
    );
  }

  return (
    <View style={styles.bracketSections}>
      {groups.length > 0 ? (
        <View style={styles.bracketSection}>
          <SectionHeading title="Group Stage" accentColor={accents.pitch} />
          <Text style={[styles.tabHint, { color: colors.textSecondary }]}>
            Top two in each group advance. Standings from ESPN.
          </Text>
          <GroupStandingsGrid groups={groups} />
        </View>
      ) : null}

      {rounds.length > 0 ? (
        <View style={styles.bracketSection}>
          <SectionHeading title="Knockout Stage" accentColor={accents.gold} />
          <Text style={[styles.tabHint, { color: colors.textSecondary }]}>
            Swipe horizontally through rounds.
          </Text>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bracketScrollContent}>
            {rounds.map((round) => (
              <View
                key={round.slug}
                style={[styles.bracketRoundColumn, { width: WORLD_CUP_KNOCKOUT_COLUMN_WIDTH }]}>
                <View style={[styles.bracketRoundHeader, { backgroundColor: accents.goldMuted }]}>
                  <Text style={[styles.bracketRoundTitle, { color: accents.gold }]}>{round.label}</Text>
                  {round.detail ? (
                    <Text style={[styles.bracketRoundDetail, { color: colors.textSecondary }]}>
                      {round.detail}
                    </Text>
                  ) : null}
                </View>
                <View style={styles.bracketMatchList}>
                  {round.matches.map((match) => (
                    <BracketMatchCard
                      key={match.id}
                      match={match}
                      onPress={() => onSelectMatch(match)}
                    />
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

function SectionHeading({ title, accentColor }: { title: string; accentColor: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.sectionHeadingRow}>
      <View style={[styles.sectionAccentBar, { backgroundColor: accentColor }]} />
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
    </View>
  );
}

function TeamColumn({
  team,
  match,
  align,
}: {
  team: WorldCupMatch['home'];
  match: WorldCupMatch;
  align: 'left' | 'right';
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.teamColumn, align === 'right' && styles.teamColumnRight]}>
      {team.logoUrl ? (
        <Image source={{ uri: team.logoUrl }} style={styles.teamLogo} contentFit="contain" />
      ) : (
        <View style={[styles.teamLogoFallback, { backgroundColor: colors.border }]}>
          <Text style={[styles.teamAbbrev, { color: colors.text }]}>{team.abbrev}</Text>
        </View>
      )}
      <Text
        style={[
          styles.teamName,
          { color: colors.text },
          team.winner && styles.teamWinner,
          align === 'right' && styles.textRight,
        ]}
        numberOfLines={2}>
        {team.name}
      </Text>
      <WorldCupTeamScore team={team} match={match} align={align} />
    </View>
  );
}

const PAST_STAGE_FILTERS: { id: WorldCupScoresStageFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'group', label: 'Group' },
  { id: 'knockout', label: 'Knockout' },
];

function PastScoresArchive({
  sectionRef,
  matches,
  stageFilter,
  onStageFilterChange,
  onSelectMatch,
}: {
  sectionRef?: React.RefObject<View | null>;
  matches: WorldCupMatch[];
  stageFilter: WorldCupScoresStageFilter;
  onStageFilterChange: (filter: WorldCupScoresStageFilter) => void;
  onSelectMatch: (match: WorldCupMatch) => void;
}) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const filteredMatches = useMemo(
    () => filterMatchesByStage(matches, stageFilter),
    [matches, stageFilter],
  );
  const dayGroups = useMemo(
    () => groupMatchesByKickoffDate(filteredMatches),
    [filteredMatches],
  );

  if (matches.length === 0) {
    return (
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
        Past results will appear here once matches are played.
      </Text>
    );
  }

  return (
    <View ref={sectionRef} style={styles.archiveSection} collapsable={false}>
      <View style={styles.archiveHeader}>
        <SectionHeading title="Past Results" accentColor={accents.gold} />
        <View style={styles.stageFilterRow}>
          {PAST_STAGE_FILTERS.map((filter) => {
            const selected = stageFilter === filter.id;
            return (
              <Pressable
                key={filter.id}
                onPress={() => onStageFilterChange(filter.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                accessibilityLabel={`Filter past results: ${filter.label}`}
                style={({ pressed }) => [
                  styles.stageFilterChip,
                  {
                    backgroundColor: selected ? colors.accentMuted : colors.surface,
                    borderColor: selected ? colors.accent : colors.border,
                  },
                  pressed && { opacity: 0.7 },
                ]}>
                <Text
                  style={[
                    styles.stageFilterText,
                    { color: selected ? colors.accent : colors.textSecondary },
                  ]}>
                  {filter.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {dayGroups.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No past matches for this stage yet.
        </Text>
      ) : (
        <View style={styles.archiveDayList}>
          {dayGroups.map((group) => (
            <View key={group.dateKey} style={styles.archiveDayGroup}>
              <Text style={[styles.archiveDayLabel, { color: colors.textSecondary }]}>
                {group.label}
              </Text>
              <View style={styles.matchList}>
                {group.matches.map((match) => (
                  <MatchCard
                    key={match.id}
                    match={match}
                    onPress={() => onSelectMatch(match)}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function ScoresView({
  matches,
  pastStageFilter,
  onPastStageFilterChange,
  onSelectMatch,
  pastSectionRef,
  onScrollToPastResults,
}: {
  matches: WorldCupMatch[];
  pastStageFilter: WorldCupScoresStageFilter;
  onPastStageFilterChange: (filter: WorldCupScoresStageFilter) => void;
  onSelectMatch: (match: WorldCupMatch) => void;
  pastSectionRef: React.RefObject<View | null>;
  onScrollToPastResults: () => void;
}) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);
  const { liveAndUpcoming, past } = useMemo(() => partitionMatchesForScores(matches), [matches]);

  return (
    <View style={styles.scoresSections}>
      <View style={styles.scoresSection}>
        <View style={styles.scoresSectionHeader}>
          <View style={styles.scoresSectionHeading}>
            <SectionHeading title="Live & Upcoming" accentColor={colors.accent} />
          </View>
          {past.length > 0 ? (
            <Pressable
              onPress={onScrollToPastResults}
              accessibilityRole="button"
              accessibilityLabel="Jump to past results"
              accessibilityHint="Scrolls to the past results archive"
              style={({ pressed }) => [
                styles.pastJumpChip,
                {
                  backgroundColor: colors.surface,
                  borderColor: accents.gold,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.pastJumpChipText, { color: accents.gold }]}>Past Results</Text>
              <Ionicons name="chevron-down" size={12} color={accents.gold} />
            </Pressable>
          ) : null}
        </View>
        {liveAndUpcoming.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No live or upcoming matches right now.
          </Text>
        ) : (
          <View style={styles.matchList}>
            {liveAndUpcoming.map((match) => (
              <MatchCard key={match.id} match={match} onPress={() => onSelectMatch(match)} />
            ))}
          </View>
        )}
      </View>

      <PastScoresArchive
        sectionRef={pastSectionRef}
        matches={past}
        stageFilter={pastStageFilter}
        onStageFilterChange={onPastStageFilterChange}
        onSelectMatch={onSelectMatch}
      />
    </View>
  );
}

function UpdateRow({ update }: { update: WorldCupUpdate }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  return (
    <Pressable
      onPress={() =>
        openPublisherArticle(update.url, { title: update.title, source: update.source })
      }
      accessibilityRole="button"
      accessibilityLabel={update.title}
      accessibilityHint={`Opens article from ${update.source}`}
      style={({ pressed }) => [
        styles.updateCard,
        { backgroundColor: colors.surface, borderColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}>
      {update.imageUrl ? (
        <Image source={{ uri: update.imageUrl }} style={styles.updateImage} contentFit="cover" />
      ) : (
        <LinearGradient
          colors={[accents.goldMuted, accents.pitchMuted]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.updateImageFallback}>
          <Ionicons name="football-outline" size={28} color={accents.pitch} />
        </LinearGradient>
      )}
      <Text style={[styles.updateTitle, { color: colors.text }]} numberOfLines={3}>
        {update.title}
      </Text>
    </Pressable>
  );
}

export default function WorldCupScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<WorldCupTab>('scores');
  const [matches, setMatches] = useState<WorldCupMatch[]>([]);
  const [groups, setGroups] = useState<WorldCupGroup[]>([]);
  const [bracket, setBracket] = useState<WorldCupBracketRound[]>([]);
  const [updates, setUpdates] = useState<WorldCupUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<WorldCupMatch | null>(null);
  const [pastStageFilter, setPastStageFilter] = useState<WorldCupScoresStageFilter>('all');
  const scrollRef = useRef<ScrollView>(null);
  const pastSectionRef = useRef<View>(null);
  const scrollOffsetY = useRef(0);

  const scrollToTop = useCallback(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    scrollOffsetY.current = 0;
  }, []);

  const scrollToPastResults = useCallback(() => {
    pastSectionRef.current?.measureInWindow((_x, pageY) => {
      scrollRef.current?.measureInWindow((_sx, scrollViewPageY) => {
        const targetY = scrollOffsetY.current + (pageY - scrollViewPageY);
        scrollRef.current?.scrollTo({ y: Math.max(0, targetY - 8), animated: true });
      });
    });
  }, []);

  const handleSelectTab = useCallback(
    (tab: WorldCupTab) => {
      if (tab === 'scores') {
        scrollToTop();
      }
      setActiveTab(tab);
    },
    [scrollToTop],
  );

  const load = useCallback(async (mode: 'initial' | 'refresh' | 'silent') => {
    if (mode === 'initial') setIsLoading(true);
    else if (mode === 'refresh') setIsRefreshing(true);

    try {
      const result = await fetchWorldCupFeed();
      setMatches(result.matches);
      setGroups(result.groups);
      setBracket(result.bracket);
      setUpdates(result.updates);
      setError(result.error ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load World Cup feed');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  const shouldPollLiveScores = isFocused && hasLiveMatches(matches);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        void load('refresh');
      });
      return unsubscribe;
    }, [navigation, load]),
  );

  useEffect(() => {
    if (!shouldPollLiveScores) return;

    const intervalId = setInterval(() => {
      void load('silent');
    }, WORLD_CUP_LIVE_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [shouldPollLiveScores, load]);

  useEffect(() => {
    if (!selectedMatch) return;

    const updated = [...matches, ...bracket.flatMap((round) => round.matches)].find(
      (match) => match.id === selectedMatch.id,
    );
    if (updated && updated !== selectedMatch) {
      setSelectedMatch(updated);
    }
  }, [matches, bracket, selectedMatch]);

  if (isLoading && matches.length === 0 && updates.length === 0 && groups.length === 0 && bracket.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FeedHeader
        title="World Cup"
        subtitle="2026 · Temporary tab"
        titleTrailing={<Ionicons name="trophy" size={22} color={colors.accent} />}
      />
      <WorldCupHeroStrip />
      <WorldCupTabBar activeTab={activeTab} onSelectTab={handleSelectTab} />
      <ScrollView
        ref={scrollRef}
        onScroll={(event) => {
          scrollOffsetY.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => load('refresh')}
            tintColor={colors.text}
            colors={[colors.text]}
            progressBackgroundColor={colors.surface}
          />
        }>
        {error ? (
          <Text style={[styles.errorText, { color: colors.accent }]}>{error}</Text>
        ) : null}

        {activeTab === 'bracket' ? (
          <View style={styles.tabContent}>
            <BracketView
              groups={groups}
              rounds={bracket}
              onSelectMatch={setSelectedMatch}
            />
          </View>
        ) : null}

        {activeTab === 'scores' ? (
          <View style={styles.tabContent}>
            <ScoresView
              matches={matches}
              pastStageFilter={pastStageFilter}
              onPastStageFilterChange={setPastStageFilter}
              onSelectMatch={setSelectedMatch}
              pastSectionRef={pastSectionRef}
              onScrollToPastResults={scrollToPastResults}
            />
          </View>
        ) : null}

        {activeTab === 'news' ? (
          <View style={styles.tabContent}>
            {updates.length === 0 ? (
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                No news updates available right now.
              </Text>
            ) : (
              <View style={styles.updateList}>
                {updates.map((update) => (
                  <UpdateRow key={update.id} update={update} />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </ScrollView>
      <WorldCupMatchDetailModal
        match={selectedMatch}
        visible={selectedMatch !== null}
        onClose={() => setSelectedMatch(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 8,
  },
  notificationCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationText: {
    flex: 1,
    gap: 2,
  },
  notificationLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 14,
    lineHeight: 18,
  },
  notificationDetail: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    marginTop: 16,
  },
  scoresSections: {
    gap: 28,
  },
  scoresSection: {
    gap: 12,
  },
  scoresSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  scoresSectionHeading: {
    flex: 1,
    minWidth: 0,
  },
  pastJumpChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  pastJumpChipText: {
    fontFamily: 'InterMedium',
    fontSize: 12,
  },
  archiveSection: {
    gap: 12,
  },
  archiveHeader: {
    gap: 10,
  },
  stageFilterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  stageFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  stageFilterText: {
    fontFamily: 'InterMedium',
    fontSize: 12,
  },
  archiveDayList: {
    gap: 20,
  },
  archiveDayGroup: {
    gap: 10,
  },
  archiveDayLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  tabHint: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: 'LoraBold',
    fontSize: 18,
    letterSpacing: -0.2,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  sectionAccentBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  bracketSections: {
    gap: 28,
  },
  bracketSection: {
    gap: 4,
  },
  groupGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  groupCard: {
    width: '47%',
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  groupTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  groupTitleRow: {
    paddingBottom: 6,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  groupTitleBadge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  groupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingBottom: 2,
  },
  groupHeaderCell: {
    width: 28,
    fontFamily: 'InterMedium',
    fontSize: 10,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  groupTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  groupTeamCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  groupLogo: {
    width: 16,
    height: 16,
  },
  groupLogoFallback: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupAbbrev: {
    fontFamily: 'InterSemiBold',
    fontSize: 7,
  },
  groupTeamName: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 11,
    lineHeight: 14,
  },
  groupStat: {
    width: 28,
    fontFamily: 'Inter',
    fontSize: 11,
    textAlign: 'center',
  },
  errorText: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 16,
    marginBottom: 4,
  },
  emptyText: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
  },
  matchList: {
    gap: 12,
  },
  matchCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  matchCardAccent: {
    borderLeftWidth: 3,
  },
  matchMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  matchStatus: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  matchDetail: {
    flex: 1,
    fontFamily: 'Inter',
    fontSize: 12,
    textAlign: 'right',
  },
  teamsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  teamColumn: {
    flex: 1,
    gap: 4,
  },
  teamColumnRight: {
    alignItems: 'flex-end',
  },
  teamLogo: {
    width: 36,
    height: 36,
  },
  teamLogoFallback: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAbbrev: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
  },
  teamName: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: 20,
  },
  teamWinner: {
    fontFamily: 'InterSemiBold',
  },
  teamScore: {
    fontFamily: 'LoraBold',
    fontSize: 28,
    lineHeight: 32,
  },
  scoreDivider: {
    fontFamily: 'Inter',
    fontSize: 12,
    textTransform: 'uppercase',
  },
  textRight: {
    textAlign: 'right',
  },
  kickoff: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 17,
  },
  bracketScrollContent: {
    gap: 12,
    paddingRight: 24,
  },
  bracketRoundColumn: {
    gap: 8,
  },
  bracketRoundHeader: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  bracketRoundTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  bracketRoundDetail: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
  },
  bracketMatchList: {
    gap: 8,
  },
  bracketMatchCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 6,
  },
  bracketTeamRow: {
    gap: 6,
  },
  bracketTeamLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bracketLogo: {
    width: 20,
    height: 20,
  },
  bracketLogoFallback: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bracketAbbrev: {
    fontFamily: 'InterSemiBold',
    fontSize: 8,
  },
  bracketTeamName: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 12,
    lineHeight: 16,
  },
  bracketTeamScore: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    minWidth: 16,
    textAlign: 'right',
  },
  bracketScoreCell: {
    alignItems: 'flex-end',
    gap: 1,
  },
  bracketPenaltyScore: {
    fontFamily: 'InterMedium',
    fontSize: 10,
    textAlign: 'right',
  },
  bracketFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  bracketKickoff: {
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 14,
  },
  updateList: {
    gap: 12,
  },
  updateCard: {
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  updateImage: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  updateImageFallback: {
    width: '100%',
    aspectRatio: 16 / 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 15,
    lineHeight: 20,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
});
