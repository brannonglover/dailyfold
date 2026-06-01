import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { CreateFolderModal } from '@/components/CreateFolderModal';
import { FolderPickerModal } from '@/components/FolderPickerModal';
import { LikedArticleList } from '@/components/LikedArticleList';
import { LikedFoldersBar } from '@/components/LikedFoldersBar';
import { TAB_BAR_HEIGHT } from '@/constants/Layout';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useArticles } from '@/hooks/useArticles';
import { useTheme } from '@/hooks/useTheme';

export default function SavedScreen() {
  const { colors } = useTheme();
  const { preferences, filterFeedArticles, folders, createFolder } = usePreferences();
  const { articles, isLoading, isRefreshing, error, notice, refresh } = useArticles();
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [organizeArticleId, setOrganizeArticleId] = useState<string | null>(null);

  const allLiked = useMemo(() => {
    const likedIds = new Set(preferences?.likedArticleIds ?? []);
    return filterFeedArticles(articles).filter((a) => likedIds.has(a.id));
  }, [articles, preferences, filterFeedArticles]);

  const displayed = useMemo(() => {
    if (!selectedFolderId) return allLiked;

    const folder = folders.find((f) => f.id === selectedFolderId);
    if (!folder) return allLiked;

    const folderIds = new Set(folder.articleIds);
    return allLiked.filter((a) => folderIds.has(a.id));
  }, [allLiked, selectedFolderId, folders]);

  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  const subtitle = selectedFolder
    ? `${displayed.length} ${displayed.length === 1 ? 'article' : 'articles'} in ${selectedFolder.name}`
    : `${allLiked.length} ${allLiked.length === 1 ? 'article' : 'articles'} saved`;

  const emptyMessage = selectedFolder
    ? `Nothing in "${selectedFolder.name}" yet. Long press a saved article to add it here.`
    : 'Like a story to save it here. Long press a saved article to add it to folders.';

  if (isLoading && allLiked.length === 0) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <>
      <View style={styles.flex}>
        {error ? (
          <Text style={[styles.error, { color: colors.accent, backgroundColor: colors.background }]}>
            {error}
          </Text>
        ) : null}
        {notice ? (
          <Text style={[styles.notice, { color: colors.textSecondary, backgroundColor: colors.background }]}>
            {notice}
          </Text>
        ) : null}
        <LikedArticleList
          articles={displayed}
          title="Liked"
          subtitle={subtitle}
          emptyMessage={emptyMessage}
          isRefreshing={isRefreshing}
          onRefresh={refresh}
          onArticleLongPress={(article) => setOrganizeArticleId(article.id)}
          headerExtra={
            <LikedFoldersBar
              folders={folders}
              selectedFolderId={selectedFolderId}
              allCount={allLiked.length}
              onSelectFolder={setSelectedFolderId}
              onCreateFolder={() => setShowCreateFolder(true)}
            />
          }
        />
      </View>

      <CreateFolderModal
        visible={showCreateFolder}
        onClose={() => setShowCreateFolder(false)}
        onCreate={async (name) => {
          const folder = await createFolder(name);
          if (folder) setSelectedFolderId(folder.id);
        }}
      />

      <FolderPickerModal
        visible={organizeArticleId !== null}
        articleId={organizeArticleId ?? ''}
        bottomOffset={TAB_BAR_HEIGHT}
        onClose={() => setOrganizeArticleId(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontFamily: 'Inter',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  notice: {
    fontFamily: 'Inter',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
