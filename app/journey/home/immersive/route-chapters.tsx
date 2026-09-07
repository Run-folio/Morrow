"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { nextHomepageRoute, routeScrollCorrection } from "@/lib/easyt/homepage-navigation";
import RoutePlanLink from "../../routes/[slug]/route-plan-link";
import ResilientImage from "@/components/easyt/resilient-image";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

const titles: Record<string, [string, string]> = {
  "japan-slow": ["Japan", "by rail."],
  "balkans-overland": ["Across borders.", "The Balkans."],
  "vietnam-cambodia": ["Vietnam", "to Cambodia."],
  "iceland-ring-road": ["Iceland’s", "open road."],
};

export function DestinationPhoto({ route, index, landscape = false }: { route: ImmersiveRoute; index: number; landscape?: boolean }) {
  const stop = route.stops[index];
  const photo = route.photos[index];
  return <div className={styles.destinationPhoto}>{photo ? <ResilientImage key={photo.key} src={photo.variants[1].src} srcSet={photo.variants.map((item) => `${item.src} ${item.width}w`).join(", ")} sizes={landscape ? "100vw" : "(max-width:840px) 45vw, 23vw"} width={768} height={1024} alt={landscape ? "" : photo.alt} loading="lazy" decoding="async" fallback={<div className={styles.photoFallback}>{stop.name}</div>} /> : <div className={styles.photoFallback}>{stop.name}</div>}<a className={styles.photoCredit} href="/journey/immersive/credits.html">{photo ? `${photo.author} · ${photo.license}` : "Image unavailable"}</a></div>;
}

export default function RouteChapters({ routes, initialIndex, children, quiet }: {
  quiet: boolean;
  routes: ImmersiveRoute[];
  initialIndex: number;
  children?: (route: ImmersiveRoute, change: (index: number, chapter?: string) => void, index: number) => React.ReactNode;
}) {
  const [index, setIndex] = useState(initialIndex);
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
    setIndex(nextHomepageRoute(next, 0, routes.length));
    requestAnimationFrame(() => {
      if (anchor && before !== undefined) window.scrollBy({ top: routeScrollCorrection(before, anchor.getBoundingClientRect().top), behavior: "instant" });
      if (chapter === "route-story") anchor?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
    });
  };
  const title = titles[route.key] ?? [route.title, ""];
  const split = route.title.indexOf(",");
  return <>
    <section id="routes" ref={places} className={styles.places} aria-label={es ? "Lugares del viaje" : "Places along the journey"}>
      <div className={styles.placesStage}>
        <div className={styles.routeHeading}><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h2>{title[0]}<em>{title[1]}</em></h2><p>{route.stops.length} {es ? "lugares" : "places"} · {route.countries.length} {es ? (route.countries.length === 1 ? "país" : "países") : (route.countries.length === 1 ? "country" : "countries")}</p>
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
        <div className={styles.photos} style={{ "--count": route.stops.length } as CSSProperties}>
          {route.stops.map((stop, i) => <figure key={stop.id} tabIndex={0} aria-label={`${stop.name} · ${stop.country}`} style={{ "--angle": [-5,3,-3,4,2][i % 5] + "deg", "--offset": [28,-34,14,-20,30][i % 5] + "px", "--ratio": [.78,.75,.8,.77,.8][i % 5] } as CSSProperties}>
            <DestinationPhoto route={route} index={i} /><figcaption><span>{String(i + 1).padStart(2,"0")} · {stop.country}</span><strong>{stop.name}</strong><small>{route.minimumNights[i]} {es ? "noches mínimas" : "minimum nights"}</small></figcaption>
          </figure>)}
        </div>
        <div className={styles.routeFoot}><span>{route.dayRange.min}–{route.dayRange.max} {es ? "días · punto de partida" : "days · a starting point"}</span><a href="#route-story">{es ? "El viaje que los conecta" : "The journey between them"} <ArrowDown aria-hidden="true" /></a></div>
      </div>
    </section>
    <section id="route-story" className={styles.story}>
      <div className={styles.storyPhoto}><DestinationPhoto route={route} index={route.stops.length - 1} landscape /></div>
      <div className={styles.storyShade} />
      <div className={styles.storyMain}><span className={styles.eyebrow}>{route.countries.join(" → ")}</span><h2 tabIndex={-1}>{split > -1 ? route.title.slice(0, split + 1) : route.title}<em>{split > -1 ? route.title.slice(split + 1).trim() : ""}</em></h2><p className={styles.theme}>{route.interestLabel}</p><p className={styles.storyIdea}>{route.summary}</p><p className={styles.sequence}>{route.stops.map((stop) => stop.name).join(" → ")}</p><p className={styles.note}>{es ? "Las noches son una guía. Confirma conexiones y horarios antes de reservar." : "Nights are a planning guide. Confirm connections and schedules before booking."}</p><div className={styles.storyActions}><RoutePlanLink draft={route.planDraft} placement="hero">{es ? "Empezar con esta ruta" : "Start with this route"}</RoutePlanLink><EasyTLinkButton href="#product" variant="quiet" icon={ArrowDown}>{es ? "Ver todo el viaje" : "See whole journey"}</EasyTLinkButton></div></div>
      <aside className={styles.alternatives}><span className={styles.eyebrow}>{es ? "Otra forma de viajar" : "Another way to go"}</span>{routes.map((other, i) => i === index ? null : <EasyTButton key={other.key} variant="quiet" icon={ArrowRight} onClick={() => change(i, "route-story")}>{other.title}</EasyTButton>)}<EasyTLinkButton href="/journey/discover" variant="quiet">{es ? "Ver todas las rutas" : "View all routes"}</EasyTLinkButton></aside>
    </section>
    {children?.(route, change, index)}
  </>;
}
