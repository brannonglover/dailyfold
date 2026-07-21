const palette = {
  light: {
    text: '#1C1C1C',
    textSecondary: '#6B6B6B',
    background: '#FAF9F7',
    surface: '#FFFFFF',
    border: '#E8E6E3',
    feedDivider: 'rgba(0, 0, 0, 0.08)',
    tint: '#E85D4C',
    tabIconDefault: '#A8A8A8',
    tabIconSelected: '#1C1C1C',
    accent: '#E85D4C',
    accentMuted: '#FCEAE8',
  },
  dark: {
    text: '#F5F5F5',
    textSecondary: '#A8A8A8',
    background: '#121212',
    surface: '#1E1E1E',
    border: '#2E2E2E',
    feedDivider: 'rgba(255, 255, 255, 0.1)',
    tint: '#FF7A6B',
    tabIconDefault: '#6B6B6B',
    tabIconSelected: '#F5F5F5',
    accent: '#FF7A6B',
    accentMuted: '#3D2522',
  },
} as const;

export default palette;

export type ColorScheme = keyof typeof palette;
