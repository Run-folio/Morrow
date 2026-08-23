import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import EasyTNavigation from "../../easyt-navigation";
import { getAuth } from "@/lib/auth";
import { listEasyTRouteControls } from "@/lib/easyt/admin-content";
import { isEasyTAuthConfigured } from "@/lib/easyt/auth-environment";
import { canonicalPublicRouteSlug, publicRouteDetailFor } from "@/lib/easyt/public-route";
import { publicRouteMetadataFor } from "@/lib/easyt/public-route-seo";
import { ensureEasyTUser, getEasyTUserPreferences } from "@/lib/easyt/repository";
import RouteDetailView from "./route-detail-view";
import styles from "./route-overview.module.css";

const routeDetail = cache(publicRouteDetailFor);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return publicRouteMetadataFor(slug);
}

export const dynamic = "force-dynamic";

export default async function RouteOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const canonicalSlug = canonicalPublicRouteSlug(slug);
  if (canonicalSlug !== slug) permanentRedirect(`/journey/routes/${canonicalSlug}`);
  const detail = routeDetail(canonicalSlug);
  if (!detail) notFound();
  const controls = await listEasyTRouteControls().catch(() => []);
  if (controls.find((control) => control.routeKey === canonicalSlug)?.published === false) notFound();

  let session: any = null;
  let preferences: Awaited<ReturnType<typeof getEasyTUserPreferences>> | null = null;
  try {
    if (isEasyTAuthConfigured()) {
      session = await getAuth().api.getSession({ headers: await headers() });
      if (session?.user) {
        await ensureEasyTUser(session.user.id, session.user.email, session.user.name);
        preferences = await getEasyTUserPreferences(session.user.id);
      }
    }
  } catch {
    session = null;
  }

  return <main className={`${styles.page} morrovia-editorial-page`}>
    <EasyTNavigation current="routes" account={session?.user ? { id: session.user.id, name: session.user.name, email: session.user.email, language: preferences?.language } : undefined} />
    <RouteDetailView detail={detail} />
  </main>;
}
