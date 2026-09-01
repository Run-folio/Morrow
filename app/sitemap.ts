import type { MetadataRoute } from "next";
import { caseStudies } from "@/lib/case-studies";
import { applyEasyTRouteControls, listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { publicRouteSitemapKeys } from "@/lib/easyt/public-route";
import { routeFamilyByKey } from "@/lib/easyt/route-catalog";

const siteUrl = "https://morrovia.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const controls = await listEasyTRouteControls().catch(() => []);
  const publicRoutes = applyEasyTRouteControls(
    publicRouteSitemapKeys().map((key) => routeFamilyByKey[key]).filter(Boolean),
    controls,
  );

  return [
    {
      url: siteUrl,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${siteUrl}/more-about-me`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/photography`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/journey`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${siteUrl}/journey/home`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/journey/discover`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${siteUrl}/journey/privacy`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/journey/terms`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/journey/cookies`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/journey/affiliate-disclosure`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${siteUrl}/journey/about`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/journey/help`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${siteUrl}/journey/passport`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...publicRoutes.map((route) => ({
      url: `${siteUrl}/journey/routes/${route.key}`,
      lastModified: new Date(route.reviewedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...caseStudies.map((study) => ({
      url: `${siteUrl}/case-study/${study.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.9,
    })),
  ];
}
