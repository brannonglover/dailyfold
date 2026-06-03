import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SourceLogo } from '@/components/SourceLogo';
import { CURIOSITY_LABELS } from '@/constants/curiosities';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { groupSourcesByCuriosity } from '@/services/sourceGroups';
import { FeedSource } from '@/types';

function sourceMatchesQuery(source: FeedSource, query: string): boolean {
  const q = query.toLowerCase();
  return (
    source.name.toLowerCase().includes(q) ||
    (source.description?.toLowerCase().includes(q) ?? false)
  );
}

export default function SourcesScreen() {
  const { colors, styles: themeStyles } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const {
    sources,
    enabledSourceCount,
    totalSourceCount,
    isSourceEnabled,
    toggleSource,
  } = usePreferences();

  const trimmedQuery = query.trim();
  const filteredSources = useMemo(
    () =>
      trimmedQuery
        ? sources.filter((source) => sourceMatchesQuery(source, trimmedQuery))
        : sources,
    [sources, trimmedQuery],
  );
  const groups = groupSourcesByCuriosity(filteredSources);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Sources',
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerTintColor: colors.text,
          headerBackTitle: 'Profile',
          contentStyle: { backgroundColor: colors.background },
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
        }}
      />
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: 24,
        }}
        keyboardShouldPersistTaps="handled">
        <Text style={[styles.lede, { color: colors.textSecondary }]}>
          Choose which publishers appear in your feeds. {enabledSourceCount} of{' '}
          {totalSourceCount} enabled.
        </Text>

        <View style={styles.searchField}>
          <Text style={themeStyles.label} nativeID="sources-search-label">
            Search outlets
          </Text>
          <TextInput
            style={themeStyles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or description"
            placeholderTextColor={colors.textSecondary}
            accessibilityLabel="Search outlets"
            accessibilityLabelledBy="sources-search-label"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
        </View>

        <View style={styles.list}>
          {trimmedQuery && groups.length === 0 ? (
            <Text style={[styles.emptyState, { color: colors.textSecondary }]}>
              No outlets match “{trimmedQuery}”
            </Text>
          ) : null}
          {groups.map((group) => (
            <View key={group.topic} style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {CURIOSITY_LABELS[group.topic]}
              </Text>
              <View style={styles.sectionList}>
                {group.sources.map((source) => {
                  const enabled = isSourceEnabled(source.id);
                  return (
                    <View
                      key={source.id}
                      style={[
                        styles.card,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}>
                      <View style={styles.cardBody}>
                        <View style={styles.titleRow}>
                          <SourceLogo uri={source.logoUrl} name={source.name} />
                          <Text style={[styles.name, { color: colors.text }]}>{source.name}</Text>
                        </View>
                        {source.description ? (
                          <Text style={[styles.description, { color: colors.textSecondary }]}>
                            {source.description}
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.switchWrap}>
                        <Switch
                          value={enabled}
                          onValueChange={() => toggleSource(source.id)}
                          trackColor={{ false: colors.border, true: colors.accentMuted }}
                          thumbColor={enabled ? colors.accent : colors.textSecondary}
                        />
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.note, { color: colors.textSecondary }]}>
          At least one source must stay on. Changes apply immediately across Latest, For You, and
          Liked.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  lede: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  searchField: {
    gap: 8,
    marginBottom: 20,
  },
  emptyState: {
    fontFamily: 'Inter',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    paddingVertical: 24,
  },
  list: {
    gap: 24,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontFamily: 'InterSemiBold',
    fontSize: 13,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sectionList: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardBody: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: 6,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  name: {
    flex: 1,
    flexShrink: 1,
    fontFamily: 'InterSemiBold',
    fontSize: 16,
  },
  description: {
    flexShrink: 1,
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
  },
  switchWrap: {
    flexShrink: 0,
  },
  note: {
    fontFamily: 'Inter',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
});
