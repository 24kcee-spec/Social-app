import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sidle',
    short_name: 'Sidle',
    description: 'Find your people. At your pace.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F6F2',
    theme_color: '#1F4FD8',
    icons: [
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/brand/sidle-mark.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
