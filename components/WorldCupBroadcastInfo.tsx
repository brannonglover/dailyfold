import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';
import type { WorldCupBroadcast, WorldCupMatch } from '@/services/worldCupFeed';
import {
  formatBroadcastNames,
  groupBroadcastsByType,
  shouldShowMatchBroadcasts,
  worldCupAccentColors,
} from '@/utils/worldCupMatchDisplay';

function BroadcastChip({
  label,
  accentColor,
  mutedColor,
}: {
  label: string;
  accentColor: string;
  mutedColor: string;
}) {
  const { colors } = useTheme();

  return (
    <View style={[styles.chip, { backgroundColor: mutedColor, borderColor: colors.border }]}>
      <Text style={[styles.chipText, { color: accentColor }]}>{label}</Text>
    </View>
  );
}

function BroadcastGroup({
  icon,
  title,
  broadcasts,
  accentColor,
  mutedColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  broadcasts: WorldCupBroadcast[];
  accentColor: string;
  mutedColor: string;
}) {
  const { colors } = useTheme();

  if (broadcasts.length === 0) return null;

  return (
    <View style={styles.group}>
      <View style={styles.groupLabelRow}>
        <Ionicons name={icon} size={13} color={colors.textSecondary} />
        <Text style={[styles.groupLabel, { color: colors.textSecondary }]}>{title}</Text>
      </View>
      <View style={styles.chipRow}>
        {broadcasts.map((broadcast) => (
          <BroadcastChip
            key={broadcast.name}
            label={broadcast.name}
            accentColor={accentColor}
            mutedColor={mutedColor}
          />
        ))}
      </View>
    </View>
  );
}

export function WorldCupBroadcastCompact({ match }: { match: WorldCupMatch }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  if (!shouldShowMatchBroadcasts(match) || !match.broadcasts) return null;

  return (
    <View style={[styles.compactRow, { backgroundColor: accents.pitchMuted }]}>
      <Ionicons name="tv-outline" size={13} color={accents.pitch} />
      <Text style={[styles.compactLabel, { color: accents.pitch }]}>Watch</Text>
      <Text style={[styles.compactNames, { color: colors.text }]} numberOfLines={1}>
        {formatBroadcastNames(match.broadcasts)}
      </Text>
    </View>
  );
}

export function WorldCupBroadcastSection({ match }: { match: WorldCupMatch }) {
  const { colors, scheme } = useTheme();
  const accents = worldCupAccentColors(scheme);

  if (!shouldShowMatchBroadcasts(match) || !match.broadcasts) return null;

  const { tv, streaming, other } = groupBroadcastsByType(match.broadcasts);
  const hasTypedGroups = tv.length > 0 || streaming.length > 0;

  return (
    <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.sectionHeader, { borderBottomColor: colors.border }]}>
        <Ionicons name="tv-outline" size={15} color={colors.accent} />
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Where to watch</Text>
      </View>
      <View style={styles.sectionBody}>
        {hasTypedGroups ? (
          <>
            <BroadcastGroup
              icon="tv-outline"
              title="TV"
              broadcasts={tv}
              accentColor={accents.pitch}
              mutedColor={accents.pitchMuted}
            />
            <BroadcastGroup
              icon="play-circle-outline"
              title="Streaming"
              broadcasts={streaming}
              accentColor={colors.accent}
              mutedColor={colors.accentMuted}
            />
            {other.length > 0 ? (
              <BroadcastGroup
                icon="radio-outline"
                title="Broadcast"
                broadcasts={other}
                accentColor={colors.text}
                mutedColor={colors.accentMuted}
              />
            ) : null}
          </>
        ) : (
          <View style={styles.chipRow}>
            {match.broadcasts.map((broadcast) => (
              <BroadcastChip
                key={broadcast.name}
                label={broadcast.name}
                accentColor={accents.pitch}
                mutedColor={accents.pitchMuted}
              />
            ))}
          </View>
        )}
        <Text style={[styles.regionHint, { color: colors.textSecondary }]}>
          US national broadcasters from ESPN
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  compactLabel: {
    fontFamily: 'InterSemiBold',
    fontSize: 11,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  compactNames: {
    flex: 1,
    fontFamily: 'InterMedium',
    fontSize: 12,
    lineHeight: 16,
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
    gap: 10,
  },
  group: {
    gap: 6,
  },
  groupLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  groupLabel: {
    fontFamily: 'InterMedium',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontFamily: 'InterSemiBold',
    fontSize: 12,
  },
  regionHint: {
    fontFamily: 'Inter',
    fontSize: 11,
    lineHeight: 15,
  },
});
