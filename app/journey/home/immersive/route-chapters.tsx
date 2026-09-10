"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { routeEditorialImagery } from "@/lib/easyt/route-editorial-imagery";
import { homepageRouteStopCards, type ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import type { RoutePhotoRecord } from "@/lib/easyt/route-images";
import { nextHomepageRoute, routeScrollCorrection, homepageJourneyLabel } from "@/lib/easyt/homepage-navigation";
import RoutePlanLink from "../../routes/[slug]/route-plan-link";
import ResilientImage from "@/components/easyt/resilient-image";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const titles: Record<string, [string, string]> = {
  "japan-south-korea": ["Japan +", "South Korea."],
  "iceland-ring-road": ["Iceland’s", "Ring Road."],
  "balkans-overland": ["Four countries.", "The Balkans."],
  "vietnam-cambodia": ["Vietnam +", "Cambodia."],
  "namibia-self-drive": ["Namibia,", "self-driven."],
  "peru-bolivia": ["Peru +", "Bolivia."],
  "mexico-guatemala": ["Mexico +", "Guatemala."],
};

export function DestinationPhoto({ route, index, photoOverride, landscape = false, sizes }: { route: ImmersiveRoute; index: number; photoOverride?: RoutePhotoRecord | null; landscape?: boolean; sizes?: string }) {
  const stop = route.stops[index];
  const photo = photoOverride === undefined ? route.photos[index] : photoOverride;
  const photoContext = routeEditorialImagery[route.key]?.bases[stop.name]?.caption;
  return <div className={styles.destinationPhoto}>{photo ? <><ResilientImage key={photo.key} src={photo.variants[1].src} srcSet={photo.variants.map((item) => `${item.src} ${item.width}w`).join(", ")} sizes={sizes ?? (landscape ? "100vw" : "(max-width:840px) 45vw, 23vw")} width={768} height={1024} alt={landscape ? "" : photo.alt} loading="lazy" decoding="async" fallback={<div className={styles.photoFallback}>{stop.name}</div>} />{photo.place !== stop.name && photoContext && <span className={styles.photoSubject}>{photoContext}</span>}<MorroviaPhotoCredit photoLabel={photo.alt} credit={`${photo.author} · ${photo.license}`} sourceHref={photo.sourceUrl} licenseHref={photo.licenseUrl} fullCreditHref={`/journey/immersive/credits.html#${photo.key}`} /></> : <div className={styles.photoFallback}>{stop.name}</div>}</div>;
}

export default function RouteChapters({ routes, index, onChange, children, quiet }: {
  quiet: boolean;
  routes: ImmersiveRoute[];
  index: number;
  onChange: (index: number) => void;
  children?: (route: ImmersiveRoute, change: (index: number, chapter?: string) => void, index: number) => React.ReactNode;
}) {

  const places = useRef<HTMLElement>(null);
  const es = useHomepageLanguage() === "es";
  const route = routes[index];
  useEffect(() => {
    if (quiet) return;
    const desktop = matchMedia("(min-width:841px)");
    let frame = 0;
    const update = () => {
      frame = 0;
      if (!places.current) return;
      const progress = Math.max(0, Math.min(1, -places.current.getBoundingClientRect().top / (innerHeight * .45)));
      places.current.style.setProperty("--progress", String(progress));
    };
    const tick = () => { if (!frame) frame = requestAnimationFrame(update); };
    const listen = () => {
      window.removeEventListener("scroll", tick);
      window.removeEventListener("resize", tick);
      cancelAnimationFrame(frame); frame = 0;
      if (desktop.matches) {
        window.addEventListener("scroll", tick, { passive: true });
        window.addEventListener("resize", tick); update();
      }
    };
    desktop.addEventListener("change", listen); listen();
    return () => { desktop.removeEventListener("change", listen); window.removeEventListener("scroll", tick); window.removeEventListener("resize", tick); cancelAnimationFrame(frame); };
  }, [quiet]);
  if (!route) return null;
  const change = (next: number, chapter = "routes") => {
    const anchor = document.getElementById(chapter);
    const before = anchor?.getBoundingClientRect().top;
    onChange(nextHomepageRoute(next, 0, routes.length));
    requestAnimationFrame(() => {
      if (anchor && before !== undefined) window.scrollBy({ top: routeScrollCorrection(before, anchor.getBoundingClientRect().top), behavior: "instant" });
      if (chapter === "route-story") anchor?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  };
  const title = titles[route.key] ?? [route.title, ""];
  const story = homepageJourneyLabel(route.key, route.title);
  const visibleCards = homepageRouteStopCards(route);
  const omittedStops = route.stops.length - visibleCards.length;
  const editorialPhotoIndex = route.photos.findIndex(photo => photo?.key === routeEditorialImagery[route.key]?.hero);
  const storyPhotoIndex = editorialPhotoIndex >= 0 ? editorialPhotoIndex : route.stops.length - 1;
  return <>
    <section id="routes" ref={places} className={styles.places} aria-label={es ? "Rutas para empezar" : "Featured route starting points"}>
      <div className={styles.placesStage}>
        <header className={styles.routeCollectionIntro}><div><span className={styles.eyebrow}>{es ? "Viajes complejos, hechos sencillos" : "Complex trips, made simple"}</span><h2>{es ? "Rutas para empezar" : "Routes to get you started"}</h2></div><p>{es ? "Siete ideas para viajes complejos. Usa una como punto de partida, cambia lo que quieras o planea un lugar completamente distinto." : "Seven ideas for complex trips. Use one as a starting point, change anything, or plan somewhere completely different."}</p></header>
        <div className={styles.routeHeading}><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h3>{title[0]}<em>{title[1]}</em></h3><p>{route.stops.length} {es ? "lugares" : "places"} · {route.countries.length} {es ? (route.countries.length === 1 ? "país" : "países") : (route.countries.length === 1 ? "country" : "countries")}</p>
          <div className={styles.routeControls} role="group" aria-label={es ? "Cambiar viaje" : "Browse journeys"} onKeyDown={(event) => {
            const key = event.key;
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
            event.preventDefault(); change(key === "Home" ? 0 : key === "End" ? routes.length - 1 : nextHomepageRoute(index, key === "ArrowRight" ? 1 : -1, routes.length));
          }}>
            <EasyTButton variant="quiet" icon={ArrowLeft} iconOnly disabled={routes.length < 2} onClick={() => change(nextHomepageRoute(index, -1, routes.length))}>{es ? "Viaje anterior" : "Previous journey"}</EasyTButton>
            <span role="status" aria-live="polite" aria-atomic="true">{index + 1} / {routes.length}<span className="sr-only"> · {route.title}</span></span>
            <EasyTButton variant="quiet" icon={ArrowRight} iconOnly disabled={routes.length < 2} onClick={() => change(nextHomepageRoute(index, 1, routes.length))}>{es ? "Siguiente viaje" : "Next journey"}</EasyTButton>
            <EasyTLinkButton href="/journey/discover" variant="quiet" icon={ArrowRight}>{es ? "Ver todas las rutas" : "View all routes"}</EasyTLinkButton>
          </div>
        </div>
        <div className={styles.photos} style={{ "--count": visibleCards.length } as CSSProperties}>
          {visibleCards.map(({ index: stopIndex, photo }, visualIndex) => { const stop = route.stops[stopIndex]; return <figure key={`${stop.id}-${stopIndex}`} tabIndex={0} aria-label={`${stop.name} · ${stop.country}`} style={{ "--angle": [-5,3,-3,4,2][visualIndex % 5] + "deg", "--offset": [28,-34,14,-20,30][visualIndex % 5] + "px", "--ratio": [.78,.75,.8,.77,.8][visualIndex % 5] } as CSSProperties}>
            <DestinationPhoto route={route} index={stopIndex} photoOverride={photo} /><figcaption><span>{String(stopIndex + 1).padStart(2,"0")} · {stop.country}</span><strong>{stop.name}</strong><small>{route.minimumNights[stopIndex]} {es ? "noches mínimas" : "minimum nights"}</small></figcaption>
          </figure>; })}
        </div>
        <div className={styles.routeFoot}><span>{es ? "Punto de partida" : "Starting point"} · {route.dayRange.min}–{route.dayRange.max} {es ? "días" : "days"}{omittedStops > 0 ? ` · +${omittedStops} ${es ? (omittedStops === 1 ? "parada más" : "paradas más") : (omittedStops === 1 ? "more stop" : "more stops")}` : ""}</span><a href="#route-story">{es ? "El viaje que los conecta" : "The journey between them"} <ArrowDown aria-hidden="true" /></a></div>
      </div>
    </section>
    <section id="route-story" className={styles.story}>
      <div className={styles.storyPhoto}><DestinationPhoto route={route} index={storyPhotoIndex} landscape /></div>
      <div className={styles.storyShade} />
      <div className={styles.storyMain}><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h2 tabIndex={-1}>{story.title}<em>{story.line}</em></h2><p className={styles.theme}>{story.theme || route.interestLabel}</p><p className={styles.storyIdea}>{route.summary}</p><p className={styles.sequence}>{route.stops.map((stop) => stop.name).join(" → ")}</p><p className={styles.note}>{es ? "Las noches son una guía. Confirma conexiones y horarios antes de reservar." : "Nights are a planning guide. Confirm connections and schedules before booking."}</p><div className={styles.storyActions}><RoutePlanLink draft={route.planDraft} placement="hero">{es ? "Empezar con esta ruta" : "Start with this route"}</RoutePlanLink><EasyTLinkButton href="#product" variant="quiet" icon={ArrowDown}>{es ? "Ver todo el viaje" : "See whole journey"}</EasyTLinkButton></div></div>
      <aside className={styles.alternatives}><span className={styles.eyebrow}>{es ? "Otra forma de viajar" : "Another way to go"}</span>{routes.map((other, i) => i === index ? null : <EasyTButton key={other.key} variant="quiet" icon={ArrowRight} onClick={() => change(i, "route-story")}>{homepageJourneyLabel(other.key, other.title).short}</EasyTButton>)}<EasyTLinkButton href="/journey/discover" variant="quiet">{es ? "Ver todas las rutas" : "View all routes"}</EasyTLinkButton></aside>
    </section>
    {children?.(route, change, index)}
  </>;
}
