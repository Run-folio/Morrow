"use client";

import { ArrowDown, ArrowRight } from "lucide-react";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { routeEditorialImagery } from "@/lib/easyt/route-editorial-imagery";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import type { RoutePhotoRecord } from "@/lib/easyt/route-images";
import { routeScrollCorrection, homepageJourneyLabel, nextHomepageRoute } from "@/lib/easyt/homepage-navigation";
import RoutePlanLink from "../../routes/[slug]/route-plan-link";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

export function DestinationPhoto({ route, index, photoOverride, landscape = false, sizes }: { route: ImmersiveRoute; index: number; photoOverride?: RoutePhotoRecord | null; landscape?: boolean; sizes?: string }) {
  const stop = route.stops[index];
  const photo = photoOverride === undefined ? route.photos[index] : photoOverride;
  return <div className={styles.destinationPhoto}>{photo ? <><ResilientImage key={photo.key} src={photo.variants[1].src} srcSet={photo.variants.map((item) => `${item.src} ${item.width}w`).join(", ")} sizes={sizes ?? (landscape ? "100vw" : "(max-width:840px) 45vw, 23vw")} width={768} height={1024} alt={landscape ? "" : photo.alt} loading="lazy" decoding="async" fallback={<div className={styles.photoFallback}>{stop.name}</div>} /><MorroviaPhotoCredit photoLabel={photo.alt} credit={`${photo.author} · ${photo.license}`} sourceHref={photo.sourceUrl} licenseHref={photo.licenseUrl} fullCreditHref={`/journey/immersive/credits.html#${photo.key}`} /></> : <div className={styles.photoFallback}>{stop.name}</div>}</div>;
}

export default function RouteChapters({ routes, index, onChange, children }: {
  quiet: boolean;
  routes: ImmersiveRoute[];
  index: number;
  onChange: (index: number) => void;
  children?: (route: ImmersiveRoute, change: (index: number, chapter?: string) => void, index: number) => React.ReactNode;
}) {
  const es = useHomepageLanguage() === "es";
  const route = routes[index];
  if (!route) return null;
  const change = (next: number, chapter = "route-story") => {
    const anchor = document.getElementById(chapter);
    const before = anchor?.getBoundingClientRect().top;
    onChange(nextHomepageRoute(next, 0, routes.length));
    requestAnimationFrame(() => {
      if (anchor && before !== undefined) window.scrollBy({ top: routeScrollCorrection(before, anchor.getBoundingClientRect().top), behavior: "instant" });
      if (chapter === "route-story") anchor?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  };
  const story = homepageJourneyLabel(route.key, route.title);
  const editorialPhotoIndex = route.photos.findIndex(photo => photo?.key === routeEditorialImagery[route.key]?.hero);
  const storyPhotoIndex = editorialPhotoIndex >= 0 ? editorialPhotoIndex : route.stops.length - 1;
  return <>
    <section id="route-story" className={styles.story}>
      <div className={styles.storyPhoto}><DestinationPhoto route={route} index={storyPhotoIndex} landscape /></div>
      <div className={styles.storyShade} />
      <div className={styles.storyMain}><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h2 tabIndex={-1}>{story.title}<em>{story.line}</em></h2><p className={styles.theme}>{story.theme || route.interestLabel}</p><p className={styles.storyIdea}>{route.summary}</p><p className={styles.sequence}>{route.stops.map((stop) => stop.name).join(" → ")}</p><div className={styles.storyActions}><RoutePlanLink draft={route.planDraft} placement="hero">{es ? "Empezar con esta ruta" : "Start with this route"}</RoutePlanLink><EasyTLinkButton href="#product" variant="quiet" icon={ArrowDown}>{es ? "Ver todo el viaje" : "See whole journey"}</EasyTLinkButton></div></div>
      <aside className={styles.alternatives} aria-label={es ? "Otros viajes" : "Other journeys"}><span className={styles.eyebrow}>{es ? "Otra forma de viajar" : "Another way to go"}</span><div className={styles.alternativeRoutes}>{routes.map((other, i) => i === index ? null : <EasyTButton className={styles.alternativeRoute} key={other.key} variant="quiet" icon={ArrowRight} onClick={() => change(i, "route-story")}><span>{homepageJourneyLabel(other.key, other.title).short}</span></EasyTButton>)}</div><EasyTLinkButton className={styles.alternativesAll} href="/journey/discover" variant="quiet" icon={ArrowRight}>{es ? "Ver todas las rutas" : "View all routes"}</EasyTLinkButton></aside>
    </section>
    {children?.(route, change, index)}
  </>;
}
