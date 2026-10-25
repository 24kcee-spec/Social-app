import { PlatformShell } from '../platform-shell';
import { SocialFeed } from '../social-feed';
export default function FeedPage() {
  return (
    <PlatformShell
      title="Your world, shared"
      description="Updates, ideas, photos and conversations from across Sidle."
    >
      <SocialFeed />
    </PlatformShell>
  );
}
