import type { MetadataRoute } from "next";

const siteUrl = "https://morrovia.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/journey/admin/", "/journey/account/", "/api/"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
