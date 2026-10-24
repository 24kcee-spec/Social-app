import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./shell-polish.css";
import "./feature-polish.css";
import "./brand-polish.css";
import "./release-hardening.css";
import "./superb-design.css";
import { ProductExperience } from "./product-experience";
import { ShellAccessibility } from "./shell-accessibility";

const description =
  "Find your people. At your pace. Sidle is a low-pressure campus social space for genuine conversations, groups and plans.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.PUBLIC_WEB_URL || "https://social-platform-web-two.vercel.app"),
  applicationName: "Sidle",
  title: { default: "Sidle — Find your people. At your pace.", template: "%s · Sidle" },
  description,
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Sidle — Find your people. At your pace.",
    description,
    siteName: "Sidle",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sidle — Find your people. At your pace.",
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: "#315ee7",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <ShellAccessibility />
        <ProductExperience />
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
