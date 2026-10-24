import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/help", "/privacy", "/community-guidelines", "/whats-new"],
      disallow: [
        "/reset",
        "/settings",
        "/profile",
        "/connections",
        "/messages",
        "/admin",
        "/offline",
      ],
    },
  };
}
