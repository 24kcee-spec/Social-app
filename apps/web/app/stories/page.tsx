import { PlatformShell } from '../platform-shell';
import { SocialFeed } from '../social-feed';
export default function StoriesPage() {
  return (
    <PlatformShell
      title="Stories"
      description="Photo and video moments that disappear from view after 24 hours."
    >
      <SocialFeed kind="story" />
    </PlatformShell>
  );
}
