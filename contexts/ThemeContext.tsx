import React, { createContext, useMemo } from 'react';

export type ColorScheme = 'dark';

interface ThemeContextValue {
  colorScheme: ColorScheme;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export function AppThemeProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ colorScheme: 'dark' as const }), []);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
