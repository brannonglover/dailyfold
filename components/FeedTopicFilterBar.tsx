import { usePreferences } from '@/contexts/PreferencesContext';
import { normalizeFeedPreferences } from '@/services/feedPreferences';
import { isSportsTopicActive } from '@/services/sportPreferences';

import { SportFilterBar } from './SportFilterBar';
import { TopicFilterBar } from './TopicFilterBar';

export function FeedTopicFilterBar() {
  const {
    preferences,
    isLoading,
    toggleTopic,
    selectAllTopics,
    toggleSportTag,
    selectAllSportTags,
  } = usePreferences();

  // Avoid showing "All" while prefs are loading (null defaults to All and hides Sports).
  if (isLoading || !preferences) {
    return null;
  }

  const normalized = normalizeFeedPreferences(preferences);
  const enabledTopics = normalized.enabledTopics;
  const showSportFilters = isSportsTopicActive(enabledTopics);

  return (
    <>
      <TopicFilterBar
        enabledTopics={enabledTopics}
        onSelectAll={() => void selectAllTopics()}
        onToggleTopic={(topic) => void toggleTopic(topic)}
      />
      {showSportFilters ? (
        <SportFilterBar
          enabledSportTags={normalized.enabledSportTags}
          onSelectAll={() => void selectAllSportTags()}
          onToggleSportTag={(tag) => void toggleSportTag(tag)}
        />
      ) : null}
    </>
  );
}
