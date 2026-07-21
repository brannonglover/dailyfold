import { Link } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

import { openPublisherArticle } from '@/utils/openPublisherBrowser';

export function ExternalLink(props: Omit<ComponentProps<typeof Link>, 'href'> & { href: string }) {
  return (
    <Link
      target="_blank"
      {...props}
      href={props.href as never}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          e.preventDefault();
          void openPublisherArticle(props.href);
        }
      }}
    />
  );
}
