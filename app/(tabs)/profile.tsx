import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeleteAccountModal } from '@/components/DeleteAccountModal';
import { FeedbackModal } from '@/components/FeedbackModal';
import { ProfileNavRow } from '@/components/ProfileNavRow';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useTheme } from '@/hooks/useTheme';
import { CURIOSITY_ORDER } from '@/constants/curiosities';
import { SPORT_TAG_LABELS } from '@/catalog/sports';
import { formatInterestLabel } from '@/utils/interestKeywords';
import { SportTag } from '@/types';

/** Bar fills at this many likes per signal so growth is visible over time. */
const SCORE_BAR_CAP = 10;

export default function ProfileScreen() {
  const [feedbackVisible, setFeedbackVisible] = useState(false);
  const [deleteAccountVisible, setDeleteAccountVisible] = useState(false);
  const { user, logout, deleteAccount } = useAuth();
  const {
    preferences,
    topTopics,
    topSportTags,
    topKeywords,
    enabledSourceCount,
    totalSourceCount,
    trendingNotificationsEnabled,
    setTrendingNotificationsEnabled,
  } = usePreferences();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const likedCount = preferences?.likedArticleIds.length ?? 0;

  async function handleTrendingAlertsToggle(enabled: boolean) {
    const result = await setTrendingNotificationsEnabled(enabled);
    if (result === 'updated') return;

    if (result === 'denied') {
      Alert.alert(
        'Notifications blocked',
        'Allow notifications in Settings to receive trending alerts.',
      );
      return;
    }

    Alert.alert(
      'Notifications unavailable',
      Platform.OS === 'web'
        ? 'Trending alerts are not supported on web.'
        : 'Trending alerts require a development build. Run npx expo run:ios or npx expo run:android, then reopen the app.',
    );
  }

  const topicScoreRows = CURIOSITY_ORDER.map((topic) => ({
    topic,
    score: preferences?.topicScores[topic] ?? 0,
  }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  const sportTagScoreRows = topSportTags.map((tag) => ({
    label: SPORT_TAG_LABELS[tag as SportTag] ?? tag,
    score: preferences?.sportTagScores?.[tag] ?? 0,
  }));

  const keywordScoreRows = topKeywords.map((keyword) => ({
    label: formatInterestLabel(keyword),
    score: preferences?.keywordScores[keyword] ?? 0,
  }));

  return (
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 24,
      }}>
      <Text style={[styles.title, { color: colors.text }]}>Profile</Text>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={[styles.avatar, { backgroundColor: colors.accentMuted }]}>
          <Text style={[styles.avatarText, { color: colors.accent }]}>
            {user?.name?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={[styles.name, { color: colors.text }]}>{user?.name}</Text>
        <Text style={[styles.email, { color: colors.textSecondary }]}>{user?.email}</Text>
      </View>

      <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>Reading taste</Text>
      <View style={[styles.statsRow, { borderColor: colors.border }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>{likedCount}</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Liked</Text>
        </View>
        <View style={[styles.divider, { backgroundColor: colors.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: colors.text }]}>
            {topTopics.length || '—'}
          </Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Top topics</Text>
        </View>
      </View>

      {topTopics.length > 0 && (
        <View style={styles.topics}>
          {topTopics.map((topic) => (
            <View key={topic} style={[styles.topicPill, { backgroundColor: colors.accentMuted }]}>
              <Text style={[styles.topicText, { color: colors.accent }]}>{topic}</Text>
            </View>
          ))}
        </View>
      )}

      {(topKeywords.length > 0 || topSportTags.length > 0) && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
            Narrower interests
          </Text>
          <Text style={[styles.sectionHelper, { color: colors.textSecondary }]}>
            Keywords from liked headlines and sport leagues you follow most.
          </Text>
          {topKeywords.length > 0 && (
            <View style={styles.topics}>
              {topKeywords.map((keyword) => (
                <View
                  key={keyword}
                  style={[styles.topicPill, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                  <Text style={[styles.topicText, { color: colors.text }]}>
                    {formatInterestLabel(keyword)}
                  </Text>
                </View>
              ))}
            </View>
          )}
          {topSportTags.length > 0 && (
            <View style={[styles.topics, { marginTop: topKeywords.length > 0 ? 8 : 0 }]}>
              {topSportTags.map((tag) => (
                <View key={tag} style={[styles.topicPill, { backgroundColor: colors.accentMuted }]}>
                  <Text style={[styles.topicText, { color: colors.accent }]}>
                    {SPORT_TAG_LABELS[tag as SportTag] ?? tag}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
        All topic scores
      </Text>
      <Text style={[styles.sectionHelper, { color: colors.textSecondary }]}>
        Each like adds 1 point to topics, sport tags, and title keywords. Bars fill at {SCORE_BAR_CAP}{' '}
        points.
      </Text>
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {topicScoreRows.length === 0 ? (
          <Text style={[styles.emptyScores, { color: colors.textSecondary }]}>
            Like articles to build your topic interests.
          </Text>
        ) : (
          topicScoreRows.map(({ topic, score }) => (
            <View key={topic} style={styles.scoreRow}>
              <Text style={[styles.topicLabel, { color: colors.text }]}>{topic}</Text>
              <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      backgroundColor: colors.accent,
                      width: `${Math.min(100, (score / SCORE_BAR_CAP) * 100)}%`,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>{score}</Text>
            </View>
          ))
        )}
      </View>

      <View
        style={[
          styles.notificationRow,
          { backgroundColor: colors.surface, borderColor: colors.border },
        ]}>
        <View style={styles.notificationCopy}>
          <Ionicons name="flame-outline" size={22} color={colors.accent} />
          <View style={styles.notificationText}>
            <Text style={[styles.notificationLabel, { color: colors.text }]}>
              Trending alerts
            </Text>
            <Text style={[styles.notificationDetail, { color: colors.textSecondary }]}>
              Breaking stories in your topics, or hot picks from likes.
            </Text>
          </View>
        </View>
        <Switch
          value={trendingNotificationsEnabled}
          onValueChange={(value) => void handleTrendingAlertsToggle(value)}
          trackColor={{ false: colors.border, true: colors.accentMuted }}
          thumbColor={trendingNotificationsEnabled ? colors.accent : colors.textSecondary}
        />
      </View>

      {(sportTagScoreRows.length > 0 || keywordScoreRows.length > 0) && (
        <>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
            Sport & keyword scores
          </Text>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {[...sportTagScoreRows, ...keywordScoreRows].map(({ label, score }) => (
              <View key={label} style={styles.scoreRow}>
                <Text style={[styles.topicLabel, { color: colors.text, width: 110 }]} numberOfLines={1}>
                  {label}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: colors.border }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        backgroundColor: colors.accent,
                        width: `${Math.min(100, (score / SCORE_BAR_CAP) * 100)}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.scoreValue, { color: colors.textSecondary }]}>{score}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
        Settings
      </Text>
      <ProfileNavRow
        href="/sources"
        icon="newspaper-outline"
        label="Sources"
        detail={`${totalSourceCount} outlets · ${enabledSourceCount} enabled`}
      />

      <View style={styles.accountActions}>
        <ProfileNavRow
          icon="chatbubble-ellipses-outline"
          label="Send feedback"
          detail="Share ideas or report issues"
          onPress={() => setFeedbackVisible(true)}
        />
        <Pressable
          onPress={logout}
          style={({ pressed }) => [
            styles.logoutButton,
            { borderColor: colors.border },
            pressed && { opacity: 0.7 },
          ]}>
          <Ionicons name="log-out-outline" size={20} color={colors.textSecondary} />
          <Text style={[styles.logoutText, { color: colors.textSecondary }]}>Sign out</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => setDeleteAccountVisible(true)}
        style={({ pressed }) => [styles.deleteAccountButton, pressed && { opacity: 0.7 }]}>
        <Ionicons name="trash-outline" size={18} color={colors.accent} />
        <Text style={[styles.deleteAccountText, { color: colors.accent }]}>Delete account</Text>
      </Pressable>

      {user?.email ? (
        <DeleteAccountModal
          visible={deleteAccountVisible}
          userEmail={user.email}
          onClose={() => setDeleteAccountVisible(false)}
          onConfirm={deleteAccount}
        />
      ) : null}
    </ScrollView>

      <FeedbackModal
        visible={feedbackVisible}
        onClose={() => setFeedbackVisible(false)}
        userName={user?.name}
        userEmail={user?.email}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontFamily: 'LoraBold',
    fontSize: 28,
    marginBottom: 24,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    marginBottom: 8,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontFamily: 'LoraBold',
    fontSize: 24,
  },
  name: {
    fontFamily: 'InterSemiBold',
    fontSize: 18,
  },
  email: {
    fontFamily: 'Inter',
    fontSize: 14,
    marginTop: 4,
  },
  sectionTitle: {
    fontFamily: 'InterMedium',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginTop: 24,
    marginBottom: 12,
  },
  sectionHelper: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
    marginTop: -4,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 16,
    padding: 20,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: 'LoraBold',
    fontSize: 28,
  },
  statLabel: {
    fontFamily: 'Inter',
    fontSize: 13,
    marginTop: 4,
  },
  divider: {
    width: 1,
    marginVertical: 4,
  },
  topics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  topicPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  topicText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    textTransform: 'capitalize',
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  topicLabel: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    width: 90,
    textTransform: 'capitalize',
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    minWidth: 0,
  },
  scoreValue: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    width: 24,
    textAlign: 'right',
  },
  emptyScores: {
    fontFamily: 'Inter',
    fontSize: 14,
  },
  notificationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    gap: 12,
  },
  notificationCopy: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  notificationText: {
    flex: 1,
    gap: 4,
  },
  notificationLabel: {
    fontFamily: 'InterMedium',
    fontSize: 15,
  },
  notificationDetail: {
    fontFamily: 'Inter',
    fontSize: 13,
    lineHeight: 18,
  },
  accountActions: {
    marginTop: 32,
    gap: 24,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderWidth: 1,
    borderRadius: 12,
  },
  logoutText: {
    fontFamily: 'InterMedium',
    fontSize: 15,
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    paddingVertical: 12,
  },
  deleteAccountText: {
    fontFamily: 'InterMedium',
    fontSize: 14,
  },
});
