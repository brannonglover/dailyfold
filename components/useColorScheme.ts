import { useContext } from 'react';

import { ThemeContext } from '@/contexts/ThemeContext';

export function useColorScheme(): 'dark' {
  const ctx = useContext(ThemeContext);
  if (ctx) return ctx.colorScheme;

  return 'dark';
}
