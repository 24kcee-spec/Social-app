import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = { title: "Social app", description: "Find people, conversations and activities at your pace." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark", themeColor: [{ media: "(prefers-color-scheme: light)", color: "#F7F6F2" }, { media: "(prefers-color-scheme: dark)", color: "#0F1217" }] };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main">Skip to main content</a>
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
