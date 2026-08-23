import type { Metadata } from "next";
import { canonicalPublicRouteSlug, isIndexablePublicRoute, publicRouteDetailFor } from "./public-route.ts";

export function publicRouteMetadataFor(inputSlug: string): Metadata {
  const canonicalSlug = canonicalPublicRouteSlug(inputSlug);
  const detail = publicRouteDetailFor(canonicalSlug);
  if (!detail) return { title: "Route not found", robots: { index: false, follow: false } };
  const canonical = `/journey/routes/${canonicalSlug}`;
  const image = detail.heroImage ? [{ url: detail.heroImage, alt: `${detail.title} route landscape` }] : undefined;
  const indexable = isIndexablePublicRoute(detail);
  return {
    title: detail.title,
    description: detail.summary,
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      title: detail.title,
      description: detail.summary,
      url: canonical,
      siteName: "Morrovia",
      type: "website",
      images: image,
    },
    twitter: image ? { card: "summary_large_image", title: detail.title, description: detail.summary, images: image.map((item) => item.url) } : undefined,
  };
}
