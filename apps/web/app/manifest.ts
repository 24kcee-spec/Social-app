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
    background_color: '#F6F7FB',
    theme_color: '#315EE7',
    categories: ['social', 'lifestyle'],
    shortcuts: [
      { name: 'Discover', short_name: 'Discover', url: '/discover' },
      { name: 'Messages', short_name: 'Messages', url: '/messages' },
      { name: 'Plans', short_name: 'Plans', url: '/plans' },
      { name: 'Settings', short_name: 'Settings', url: '/settings' },
      { name: 'Help & safety', short_name: 'Help', url: '/help' },
    ],
    icons: [
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
