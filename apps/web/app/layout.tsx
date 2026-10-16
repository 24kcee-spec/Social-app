import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Social App",
  description: "Find people, conversations and activities at your pace.",
  openGraph: {
    title: "Social App",
    description: "Find people, conversations and activities at your pace.",
  },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark", themeColor: "#F7F6F2" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400..700;1,9..40,400..700&family=Plus+Jakarta+Sans:ital,wght@0,400..800;1,400..800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
