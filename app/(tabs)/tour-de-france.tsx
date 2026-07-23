import { Ionicons } from '@expo/vector-icons';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { ParamListBase } from '@react-navigation/native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/BrandLogo';
import { FeedHeader } from '@/components/FeedHeader';
import { TourGcStandings } from '@/components/TourGcStandings';
import { TourJerseyChips } from '@/components/TourJerseyChips';
import { TourPillBar } from '@/components/TourPillBar';
import { TourStageTimeline } from '@/components/TourStageTimeline';
import { TOUR_JERSEY_COLORS } from '@/constants/tourDeFrance';
import { TourJerseyHolder, TourStage } from '@/data/tourDeFrance2026';
import { useTheme } from '@/hooks/useTheme';
import {
  TourNewsUpdate,
  TourPill,
  collapsedGcStandings,
  fetchTourDeFranceFeed,
  formatStagePillLabel,
  getStageByNumber,
  getStaticRaceSnapshot,
} from '@/services/tourDeFranceFeed';
import { openPublisherArticle } from '@/utils/openPublisherBrowser';

function formatNewsDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function stageTypeLabel(type: TourStage['type']): string {
  switch (type) {
    case 'itt':
      return 'Individual time trial';
    case 'ttt':
      return 'Team time trial';
    case 'mountain':
      return 'Mountain';
    case 'hilly':
      return 'Hilly';
    default:
      return 'Flat';
  }
}

function featuredCopyForStage(
  stage: TourStage | undefined,
  race: {
    currentStageNumber: number;
    featuredHeadline: string;
    featuredSource: string;
    featuredDateLabel: string;
    featuredEyebrow: string;
  },
): { headline: string; source: string; dateLabel: string; eyebrow: string } {
  if (!stage || stage.number === race.currentStageNumber) {
    return {
      headline: race.featuredHeadline,
      source: race.featuredSource,
      dateLabel: race.featuredDateLabel,
      eyebrow: race.featuredEyebrow,
    };
  }

  const dateLabel = new Date(`${stage.date}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const eyebrow =
    stage.eyebrow ?? `${stage.start.toUpperCase()} → ${stage.finish.toUpperCase()}`;

  if (stage.winner) {
    return {
      headline: `${stage.winner} wins stage ${stage.number} into ${stage.finish}`,
      source: 'Race notes',
      dateLabel,
      eyebrow,
    };
  }

  if (stage.number > race.currentStageNumber) {
    return {
      headline: `Up next: stage ${stage.number} ${stage.start} → ${stage.finish}`,
      source: 'Route',
      dateLabel,
      eyebrow,
    };
  }

  return {
    headline: `Stage ${stage.number}: ${stage.start} → ${stage.finish}`,
    source: 'Route',
    dateLabel,
    eyebrow,
  };
}

function FeaturedStory({
  stage,
  isLive,
  headline,
  source,
  dateLabel,
  eyebrow,
  imageUrl,
  heroUpdate,
}: {
  stage: TourStage | undefined;
  isLive: boolean;
  headline: string;
  source: string;
  dateLabel: string;
  eyebrow: string;
  imageUrl?: string;
  heroUpdate?: TourNewsUpdate;
}) {
  const { colors } = useTheme();
  const resolvedHeadline = heroUpdate?.title ?? headline;
  const resolvedSource = heroUpdate?.source ?? source;
  const resolvedDate = heroUpdate ? formatNewsDate(heroUpdate.publishedAt) : dateLabel;
  const resolvedEyebrow =
    stage?.eyebrow ??
    eyebrow ??
    (stage ? `STAGE ${stage.number} · ${stage.finish.toUpperCase()}` : 'TOUR DE FRANCE');
  const resolvedImage = heroUpdate?.imageUrl ?? imageUrl;
  const badgeLabel = isLive
    ? `● LIVE · STAGE ${stage?.number ?? ''}`
    : stage
      ? `STAGE ${stage.number} RECAP`
      : 'TOUR';

  const openStory = () => {
    if (!heroUpdate) return;
    void openPublisherArticle(heroUpdate.url, {
      title: heroUpdate.title,
      source: heroUpdate.source,
    });
  };

  return (
    <Pressable
      onPress={heroUpdate ? openStory : undefined}
      disabled={!heroUpdate}
      accessibilityRole={heroUpdate ? 'button' : undefined}
      accessibilityLabel={resolvedHeadline}
      style={({ pressed }) => [pressed && heroUpdate ? { opacity: 0.85 } : null]}>
      <View style={[styles.heroWrap, { backgroundColor: colors.surface }]}>
        {resolvedImage ? (
          <Image source={{ uri: resolvedImage }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <LinearGradient
            colors={[colors.accentMuted, colors.surface]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroFallback}>
            <Ionicons name="bicycle" size={40} color={colors.accent} />
          </LinearGradient>
        )}
        <View style={[styles.liveBadge, { backgroundColor: colors.accent }]}>
          <Text style={styles.liveBadgeText}>{badgeLabel}</Text>
        </View>
      </View>

      <Text style={[styles.tag, { color: colors.accent }]}>{resolvedEyebrow}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.source, { color: colors.accent }]}>{resolvedSource}</Text>
        <Text style={[styles.date, { color: colors.textSecondary }]}>{resolvedDate}</Text>
      </View>
      <Text style={[styles.headline, { color: colors.text }]}>{resolvedHeadline}</Text>
      {stage ? (
        <Text style={[styles.stageMeta, { color: colors.textSecondary }]}>
          {stage.start} → {stage.finish}
          {stage.distanceKm > 0 ? ` · ${stage.distanceKm} km` : ''}
          {` · ${stageTypeLabel(stage.type)}`}
          {stage.winner ? ` · Winner: ${stage.winner}` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
}

function SecondaryArticleRow({ update }: { update: TourNewsUpdate }) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() =>
        openPublisherArticle(update.url, { title: update.title, source: update.source })
      }
      accessibilityRole="button"
      accessibilityLabel={update.title}
      accessibilityHint={`Opens article from ${update.source}`}
      style={({ pressed }) => [
        styles.secondaryRow,
        { borderTopColor: colors.border },
        pressed && { opacity: 0.75 },
      ]}>
      {update.imageUrl ? (
        <Image source={{ uri: update.imageUrl }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.surface }]}>
          <Ionicons name="newspaper-outline" size={22} color={colors.textSecondary} />
        </View>
      )}
      <View style={styles.secondaryCopy}>
        {update.tag ? (
          <Text style={[styles.tag, styles.secondaryTag, { color: colors.accent }]}>
            {update.tag}
          </Text>
        ) : null}
        <Text style={[styles.secondaryTitle, { color: colors.text }]} numberOfLines={3}>
          {update.title}
        </Text>
        <Text style={[styles.secondarySource, { color: colors.textSecondary }]}>
          {update.source}
        </Text>
      </View>
    </Pressable>
  );
}

function JerseyDetailList({ jerseys }: { jerseys: TourJerseyHolder[] }) {
  const { colors } = useTheme();

  return (
    <View style={styles.detailList}>
      {jerseys.map((jersey) => (
        <View
          key={jersey.kind}
          style={[styles.jerseyDetailRow, { borderTopColor: colors.border }]}>
          <View style={[styles.jerseySwatch, { backgroundColor: TOUR_JERSEY_COLORS[jersey.kind] }]} />
          <View style={styles.jerseyDetailCopy}>
            <Text style={[styles.jerseyDetailLabel, { color: colors.accent }]}>
              {jersey.label.toUpperCase()}
            </Text>
            <Text style={[styles.jerseyDetailName, { color: colors.text }]}>{jersey.rider}</Text>
            <Text style={[styles.jerseyDetailMeta, { color: colors.textSecondary }]}>
              {jersey.detail}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

export default function TourDeFranceScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<ParamListBase>>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const initialRace = useMemo(() => getStaticRaceSnapshot(), []);
  const [activePill, setActivePill] = useState<TourPill>('stage');
  const [race, setRace] = useState(initialRace);
  const [updates, setUpdates] = useState<TourNewsUpdate[]>([]);
  const [selectedStageNumber, setSelectedStageNumber] = useState(initialRace.currentStageNumber);
  const [gcExpanded, setGcExpanded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    if (mode === 'refresh') setIsRefreshing(true);

    try {
      const result = await fetchTourDeFranceFeed();
      setRace(result.race);
      setUpdates(result.updates);
      setSelectedStageNumber((prev) => prev || result.race.currentStageNumber);
      setError(result.error ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load Tour feed');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load('initial');
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      const unsubscribe = navigation.addListener('tabPress', () => {
        if (!navigation.isFocused()) return;
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        void load('refresh');
      });
      return unsubscribe;
    }, [navigation, load]),
  );

  const selectedStage = getStageByNumber(race, selectedStageNumber);
  const stageCopy = featuredCopyForStage(selectedStage, race);
  const heroUpdate =
    selectedStageNumber === race.currentStageNumber ? updates[0] : undefined;
  const secondaryUpdates =
    selectedStageNumber === race.currentStageNumber ? updates.slice(1) : updates;
  const gcRows = gcExpanded
    ? race.generalClassification
    : collapsedGcStandings(race.generalClassification, 5);

  const handleSelectJersey = useCallback(() => {
    setActivePill('jerseys');
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const handleSelectStage = useCallback((stageNumber: number) => {
    setSelectedStageNumber(stageNumber);
    setActivePill('stage');
  }, []);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <FeedHeader title="Tour de France" titleTrailing={<BrandLogo />} />
      <TourPillBar
        activePill={activePill}
        stageLabel={formatStagePillLabel(selectedStageNumber)}
        onSelectPill={setActivePill}
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 24,
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

        {activePill === 'stage' ? (
          <View style={styles.section}>
            <TourJerseyChips jerseys={race.jerseys} onSelectJersey={handleSelectJersey} />

            <View style={styles.pad}>
              <FeaturedStory
                stage={selectedStage}
                isLive={race.isLive && selectedStageNumber === race.currentStageNumber}
                headline={stageCopy.headline}
                source={stageCopy.source}
                dateLabel={stageCopy.dateLabel}
                eyebrow={stageCopy.eyebrow}
                imageUrl={race.featuredImageUrl}
                heroUpdate={heroUpdate}
              />

              <View style={styles.timelineBlock}>
                <TourStageTimeline
                  stages={race.stages}
                  currentStageNumber={race.currentStageNumber}
                  selectedStageNumber={selectedStageNumber}
                  onSelectStage={handleSelectStage}
                />
              </View>

              <TourGcStandings
                riders={gcRows}
                expanded={gcExpanded}
                onToggleExpand={() => setGcExpanded((value) => !value)}
              />

              {secondaryUpdates.length > 0 ? (
                <View style={styles.newsBlock}>
                  {secondaryUpdates.map((update) => (
                    <SecondaryArticleRow key={update.id} update={update} />
                  ))}
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {activePill === 'gc' ? (
          <View style={[styles.pad, styles.section]}>
            <Text style={[styles.updatedMeta, { color: colors.textSecondary }]}>
              After stage {race.currentStageNumber} · Manual snapshot
            </Text>
            <TourGcStandings riders={race.generalClassification} expanded showHeader />
          </View>
        ) : null}

        {activePill === 'jerseys' ? (
          <View style={[styles.pad, styles.section]}>
            <TourJerseyChips jerseys={race.jerseys} />
            <JerseyDetailList jerseys={race.jerseys} />
          </View>
        ) : null}

        {activePill === 'riders' ? (
          <View style={[styles.pad, styles.section]}>
            {race.riders.map((rider) => (
              <View
                key={rider.id}
                style={[styles.riderRow, { borderTopColor: colors.border }]}>
                <View style={styles.riderCopy}>
                  <Text style={[styles.riderName, { color: colors.text }]}>{rider.name}</Text>
                  <Text style={[styles.riderMeta, { color: colors.textSecondary }]}>
                    {rider.team} · {rider.nation}
                  </Text>
                  <Text style={[styles.riderRole, { color: colors.accent }]}>{rider.role}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  section: {
    marginTop: 4,
  },
  pad: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  errorText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  heroWrap: {
    position: 'relative',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    height: 150,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveBadge: {
    position: 'absolute',
    left: 10,
    top: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  liveBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'InterBold',
    fontSize: 10,
    letterSpacing: 0.4,
  },
  tag: {
    fontFamily: 'InterBold',
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 2,
  },
  source: {
    fontFamily: 'InterSemiBold',
    fontSize: 14,
  },
  date: {
    fontFamily: 'Inter',
    fontSize: 13,
  },
  headline: {
    fontFamily: 'LoraBold',
    fontSize: 19,
    lineHeight: 24,
    marginTop: 2,
    marginBottom: 8,
  },
  stageMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 14,
  },
  timelineBlock: {
    marginBottom: 14,
  },
  newsBlock: {
    marginTop: 8,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: 10,
  },
  thumbFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  secondaryTag: {
    marginBottom: 4,
  },
  secondaryTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 14.5,
    lineHeight: 19,
    marginBottom: 4,
  },
  secondarySource: {
    fontFamily: 'Inter',
    fontSize: 12,
  },
  updatedMeta: {
    fontFamily: 'Inter',
    fontSize: 12,
    marginBottom: 10,
  },
  detailList: {
    marginTop: 8,
  },
  jerseyDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  jerseySwatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  jerseyDetailCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  jerseyDetailLabel: {
    fontFamily: 'InterBold',
    fontSize: 11,
    letterSpacing: 0.4,
  },
  jerseyDetailName: {
    fontFamily: 'InterSemiBold',
    fontSize: 16,
  },
  jerseyDetailMeta: {
    fontFamily: 'Inter',
    fontSize: 13,
  },
  riderRow: {
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  riderCopy: {
    gap: 3,
  },
  riderName: {
    fontFamily: 'InterSemiBold',
    fontSize: 16,
  },
  riderMeta: {
    fontFamily: 'Inter',
    fontSize: 13,
  },
  riderRole: {
    fontFamily: 'InterMedium',
    fontSize: 13,
  },
});
