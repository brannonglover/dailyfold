import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/hooks/useTheme';

export type WorldCupTab = 'bracket' | 'scores' | 'news';

const TABS: {
  id: WorldCupTab;
  label: string;
  accessibilityLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  { id: 'bracket', label: 'Bracket', accessibilityLabel: 'Bracket', icon: 'git-network-outline' },
  { id: 'scores', label: 'Scores', accessibilityLabel: 'Scores', icon: 'football-outline' },
  { id: 'news', label: 'News', accessibilityLabel: 'Latest News', icon: 'newspaper-outline' },
];

interface WorldCupTabBarProps {
  activeTab: WorldCupTab;
  onSelectTab: (tab: WorldCupTab) => void;
}

export function WorldCupTabBar({ activeTab, onSelectTab }: WorldCupTabBarProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { borderBottomColor: colors.border }]}>
      <View style={styles.row}>
        {TABS.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              onPress={() => onSelectTab(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={tab.accessibilityLabel}
              style={({ pressed }) => [
                styles.chip,
                {
                  backgroundColor: selected ? colors.accentMuted : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
                selected && styles.chipSelected,
                pressed && { opacity: 0.7 },
              ]}>
              <Ionicons
                name={tab.icon}
                size={14}
                color={selected ? colors.accent : colors.textSecondary}
              />
              <Text
                style={[styles.chipText, { color: selected ? colors.accent : colors.text }]}
                numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 24,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    minWidth: 0,
  },
  chipSelected: {
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  chipText: {
    flexShrink: 1,
    fontFamily: 'InterMedium',
    fontSize: 13,
    lineHeight: 16,
  },
});
