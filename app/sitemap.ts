import type { MetadataRoute } from "next";
import { caseStudies } from "@/lib/case-studies";

const siteUrl = "https://shaunwhiting.com";
const easyTRouteSlugs = ["japan-slow", "portugal-coast", "andean-highlands", "taiwan-rail"];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

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
      url: `${siteUrl}/journey/privacy`,
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
      url: `${siteUrl}/journey/passport`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    ...easyTRouteSlugs.map((slug) => ({
      url: `${siteUrl}/journey/routes/${slug}`,
      lastModified: now,
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
