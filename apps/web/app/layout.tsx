import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import './shell-polish.css';
import './feature-polish.css';
import './brand-polish.css';
import './release-hardening.css';
import './superb-design.css';
import './superb-pages.css';
import './superb-components.css';
import './plans-polish.css';
import './platform.css';
import { ProductExperience } from './product-experience';
import { ShellAccessibility } from './shell-accessibility';

const description =
  'People. Moments. Possibilities. Share photos, reels, music and conversations, discover communities and make plans on Sidle.';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_WEB_URL || 'https://social-platform-web-two.vercel.app'),
  applicationName: 'Sidle',
  title: { default: 'Sidle — People. Moments. Possibilities.', template: '%s · Sidle' },
  description,
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    title: 'Sidle — People. Moments. Possibilities.',
    description,
    siteName: 'Sidle',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sidle — People. Moments. Possibilities.',
    description,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  colorScheme: 'light dark',
  themeColor: '#315ee7',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        <ShellAccessibility />
        <ProductExperience />
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
