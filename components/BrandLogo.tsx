import { Image, type ImageStyle } from 'expo-image';
import { StyleSheet, type StyleProp } from 'react-native';

const logoSource = require('@/assets/images/logo.png');

interface BrandLogoProps {
  style?: StyleProp<ImageStyle>;
}

export function BrandLogo({ style }: BrandLogoProps) {
  return (
    <Image
      source={logoSource}
      style={[styles.logo, style]}
      contentFit="contain"
      accessibilityLabel="DailyFold"
    />
  );
}

const styles = StyleSheet.create({
  logo: {
    height: 32,
    width: 104,
    maxWidth: 120,
  },
});
