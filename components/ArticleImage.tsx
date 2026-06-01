import { Ionicons } from '@expo/vector-icons';
import { Image, ImageStyle } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import {
  ARTICLE_NO_IMAGE,
  isArticlePlaceholderImageUrl,
  resolveArticleImageUrl,
} from '@/constants/images';
import { useTheme } from '@/hooks/useTheme';
import { resolveArticleSourceLogo } from '@/utils/sourceLogo';
import { sourceHeroGradientColors } from '@/utils/sourceHeroBackground';

interface ArticleImageProps {
  uri: string;
  style?: StyleProp<ImageStyle>;
  /** Helps expo-image reset when FlatList recycles cells (expo-image v56). */
  recyclingKey?: string;
  /** Smaller layouts (e.g. liked-list thumbnails) show icon only. */
  compact?: boolean;
  source?: string;
  sourceLogo?: string;
}

function ArticleImagePlaceholder({
  style,
  compact,
}: {
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const iconSize = compact ? 20 : 40;

  return (
    <View
      style={[styles.placeholder, { backgroundColor: colors.accentMuted }, style]}
      accessibilityRole="image"
      accessibilityLabel="No image available">
      <Ionicons name="image-outline" size={iconSize} color={colors.accent} style={styles.placeholderIcon} />
      {!compact ? (
        <Text style={[styles.placeholderText, { color: colors.textSecondary }]}>No image</Text>
      ) : null}
    </View>
  );
}

function ArticleSourceLogoHero({
  logoUri,
  sourceName,
  style,
  compact,
}: {
  logoUri?: string;
  sourceName: string;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const { colors, scheme } = useTheme();
  const [logoFailed, setLogoFailed] = useState(false);
  const initial = sourceName.trim().charAt(0).toUpperCase() || '?';
  const gradientColors = sourceHeroGradientColors(sourceName, colors, scheme === 'dark');
  const showLogo = !!logoUri && !logoFailed;

  useEffect(() => {
    setLogoFailed(false);
  }, [logoUri]);

  const logoFrameSize = compact ? 36 : 88;
  const logoImageSize = compact ? 24 : 56;

  return (
    <LinearGradient
      colors={[...gradientColors]}
      locations={[0, 0.55, 1]}
      style={[styles.logoHero, style]}
      accessibilityRole="image"
      accessibilityLabel={`${sourceName} logo`}>
      <View
        style={[
          styles.logoFrame,
          compact ? styles.logoFrameCompact : styles.logoFrameHero,
          {
            width: logoFrameSize,
            height: logoFrameSize,
            backgroundColor: colors.surface,
            borderColor: colors.border,
          },
        ]}>
        {showLogo ? (
          <Image
            source={{ uri: logoUri }}
            style={{ width: logoImageSize, height: logoImageSize }}
            contentFit="contain"
            transition={150}
            cachePolicy="memory-disk"
            onError={() => setLogoFailed(true)}
          />
        ) : (
          <Text style={[styles.logoInitial, { color: colors.textSecondary, fontSize: compact ? 16 : 32 }]}>
            {initial}
          </Text>
        )}
      </View>
    </LinearGradient>
  );
}

export function ArticleImage({
  uri,
  style,
  recyclingKey,
  compact,
  source,
  sourceLogo,
}: ArticleImageProps) {
  const { colors } = useTheme();
  const resolvedUri = resolveArticleImageUrl(uri);
  const [loadUri, setLoadUri] = useState(resolvedUri);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    setLoadUri(resolvedUri);
    setLoadFailed(false);
  }, [resolvedUri]);

  const showPlaceholder =
    loadFailed || loadUri === ARTICLE_NO_IMAGE || isArticlePlaceholderImageUrl(loadUri);

  const resolvedSourceLogo =
    source || sourceLogo
      ? resolveArticleSourceLogo({ source: source ?? '', sourceLogo })
      : undefined;

  if (showPlaceholder && source) {
    return (
      <ArticleSourceLogoHero
        logoUri={resolvedSourceLogo}
        sourceName={source}
        style={style}
        compact={compact}
      />
    );
  }

  if (showPlaceholder) {
    return <ArticleImagePlaceholder style={style} compact={compact} />;
  }

  return (
    <View style={[styles.wrap, style, { backgroundColor: colors.surface }]}>
      <Image
        source={{ uri: loadUri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey}
        onError={() => setLoadFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  placeholderIcon: {
    opacity: 0.75,
  },
  placeholderText: {
    fontFamily: 'InterMedium',
    fontSize: 13,
    letterSpacing: 0.2,
  },
  logoHero: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logoFrameHero: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  logoFrameCompact: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  logoInitial: {
    fontFamily: 'InterSemiBold',
  },
});
