import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View } from 'react-native';

import Colors from '@/constants/Colors';

const colors = Colors.dark;

/**
 * Frosted-glass backdrop for the bottom tab bar. The tab bar floats over the
 * scene (position: 'absolute'), so feed content scrolls underneath and shows
 * through the blur. A thin tint of the app background keeps it on-theme, and
 * a hairline on top separates it from content.
 */
export default function TabBarBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={70}
        tint={Platform.OS === 'ios' ? 'systemChromeMaterialDark' : 'dark'}
        experimentalBlurMethod="dimezisBlurView"
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.tabBarTint }]} />
      <View style={[styles.hairline, { backgroundColor: colors.feedDivider }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  hairline: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
  },
});
