import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/game/db";

/**
 * Search engines get the public pages. The app screens are either private
 * (host, account) or meaningless out of context (a student's game URL), and a
 * search result pointing into someone's live class is the last thing we want.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/host", "/play/", "/account", "/auth/", "/api/"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
