import { useIsFocused } from '@react-navigation/native';
import { memo, type ReactNode } from 'react';

/**
 * Unmounts inactive tab content so feed hooks and lists do not subscribe or
 * reconcile while another tab is focused. Keeps the tab shell mounted for
 * instant tab-bar response.
 */
export const TabFocusGate = memo(function TabFocusGate({ children }: { children: ReactNode }) {
  const isFocused = useIsFocused();
  if (!isFocused) return null;
  return children;
});
