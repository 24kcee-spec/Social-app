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
export const viewport: Viewport = { width: "device-width", initialScale: 1, colorScheme: "light dark", themeColor: "#1F4FD8" };

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
