import { PlatformShell } from '../platform-shell';
import { SocialFeed } from '../social-feed';
export default function ReelsPage() {
  return (
    <PlatformShell
      title="Reels"
      description="Short videos from people and creators on Sidle. Playback starts when you choose it."
    >
      <SocialFeed kind="reel" />
    </PlatformShell>
  );
}
