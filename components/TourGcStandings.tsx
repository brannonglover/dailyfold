import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TourGcRider } from '@/data/tourDeFrance2026';
import { useTheme } from '@/hooks/useTheme';

interface TourGcStandingsProps {
  riders: TourGcRider[];
  expanded: boolean;
  onToggleExpand?: () => void;
  showHeader?: boolean;
}

export function TourGcStandings({
  riders,
  expanded,
  onToggleExpand,
  showHeader = true,
}: TourGcStandingsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      {showHeader ? (
        <View style={styles.headerRow}>
          <Text style={[styles.eyebrow, { color: colors.accent }]}>GENERAL CLASSIFICATION</Text>
          {onToggleExpand ? (
            <Pressable
              onPress={onToggleExpand}
              accessibilityRole="button"
              accessibilityLabel={expanded ? 'Collapse standings' : 'Show full standings'}
              hitSlop={8}>
              <Text style={[styles.expand, { color: colors.textSecondary }]}>
                {expanded ? 'Less ⌃' : 'Full ⌄'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {riders.map((rider) => (
        <View
          key={`${rider.position}-${rider.name}`}
          style={[styles.row, { borderTopColor: colors.border }]}>
          <Text style={[styles.pos, { color: colors.textSecondary }]}>{rider.position}</Text>
          <View style={styles.nameCol}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {rider.shortName}
            </Text>
            <Text style={[styles.team, { color: colors.textSecondary }]} numberOfLines={1}>
              {rider.team}
            </Text>
          </View>
          <Text style={[styles.time, { color: colors.textSecondary }]}>
            {rider.position === 1 ? rider.time : rider.gap}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  eyebrow: {
    fontFamily: 'InterBold',
    fontSize: 11.5,
    letterSpacing: 0.4,
  },
  expand: {
    fontFamily: 'Inter',
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pos: {
    width: 20,
    fontFamily: 'InterBold',
    fontSize: 13,
  },
  nameCol: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  name: {
    fontFamily: 'InterSemiBold',
    fontSize: 13.5,
  },
  team: {
    fontFamily: 'Inter',
    fontSize: 11,
  },
  time: {
    fontFamily: 'InterMedium',
    fontSize: 12.5,
    fontVariant: ['tabular-nums'],
  },
});
