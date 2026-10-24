import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Sidle',
    short_name: 'Sidle',
    description: 'Find your people. At your pace.',
    start_url: '/discover',
    scope: '/',
    display: 'standalone',
    background_color: '#F7F6F2',
    theme_color: '#1F4FD8',
    categories: ['social', 'lifestyle'],
    shortcuts: [
      { name: 'Discover', short_name: 'Discover', url: '/discover' },
      { name: 'Messages', short_name: 'Messages', url: '/messages' },
      { name: 'Community', short_name: 'Community', url: '/community' },
      { name: 'Settings', short_name: 'Settings', url: '/settings' },
    ],
    icons: [
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
