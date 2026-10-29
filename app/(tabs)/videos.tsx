import { memo } from 'react';

import { TabFocusGate } from '@/components/TabFocusGate';
import { VideoFeed } from '@/components/VideoFeed';

function VideosScreenContent() {
  return (
    <TabFocusGate>
      <VideoFeed />
    </TabFocusGate>
  );
}

export default memo(VideosScreenContent);
