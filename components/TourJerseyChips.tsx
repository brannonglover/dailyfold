import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TOUR_JERSEY_COLORS, TourJerseyKind } from '@/constants/tourDeFrance';
import { TourJerseyHolder } from '@/data/tourDeFrance2026';
import { useTheme } from '@/hooks/useTheme';

interface TourJerseyChipsProps {
  jerseys: TourJerseyHolder[];
  onSelectJersey?: (jersey: TourJerseyHolder) => void;
}

function jerseyIconColor(kind: TourJerseyKind): string {
  return kind === 'white' ? '#111111' : '#1A1A1A';
}

export function TourJerseyChips({ jerseys, onSelectJersey }: TourJerseyChipsProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.row}>
      {jerseys.map((jersey) => {
        const bg = TOUR_JERSEY_COLORS[jersey.kind];
        const content = (
          <>
            <View style={[styles.dot, { backgroundColor: bg }]}>
              <Ionicons name="bicycle" size={14} color={jerseyIconColor(jersey.kind)} />
            </View>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {jersey.shortName}
            </Text>
          </>
        );

        if (!onSelectJersey) {
          return (
            <View key={jersey.kind} style={styles.chip} accessibilityLabel={`${jersey.label}: ${jersey.rider}`}>
              {content}
            </View>
          );
        }

        return (
          <Pressable
            key={jersey.kind}
            onPress={() => onSelectJersey(jersey)}
            accessibilityRole="button"
            accessibilityLabel={`${jersey.label} jersey: ${jersey.rider}`}
            accessibilityHint="Shows jersey standings"
            style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}>
            {content}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  dot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    fontFamily: 'InterBold',
    fontSize: 9.5,
    textAlign: 'center',
  },
});
