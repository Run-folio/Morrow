"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import ResilientImage from "@/components/easyt/resilient-image";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

type InspirationPhoto = {
  credit: string;
  focalPosition?: string;
  fullCreditHref?: string;
  licenseHref?: string;
  photoLabel: string;
  sourceHref?: string;
  variants: Array<{ src: string; width: number }>;
};

function inspirationPhotos(route: ImmersiveRoute, es: boolean): InspirationPhoto[] {
  const hero = route.heroPhoto;
  const heroFallback = route.heroPhoto?.fallback;
  const photo = route.photos.find((candidate) => candidate !== null) ?? null;
  const heroCandidate = (candidate: NonNullable<ImmersiveRoute["heroPhoto"]>): InspirationPhoto => ({
    variants: candidate.variants,
    credit: es ? candidate.creditEs : candidate.credit,
    photoLabel: candidate.country,
    sourceHref: candidate.source.startsWith("http") ? candidate.source : undefined,
    fullCreditHref: candidate.firstParty ? undefined : "/journey/immersive/credits.html",
    focalPosition: candidate.focalPosition,
  });
  return [
    ...(hero ? [heroCandidate(hero)] : []),
    ...(heroFallback ? [heroCandidate(heroFallback)] : []),
    ...(photo ? [{ variants: photo.variants, credit: `${photo.author} · ${photo.license}`, photoLabel: photo.alt, sourceHref: photo.sourceUrl, licenseHref: photo.licenseUrl, fullCreditHref: `/journey/immersive/credits.html#${photo.key}` }] : []),
  ];
}

function HomepageRouteCard({ route, es }: { route: ImmersiveRoute; es: boolean }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const photo = inspirationPhotos(route, es)[photoIndex];
  const days = route.dayRange.min === route.dayRange.max ? route.dayRange.min : `${route.dayRange.min}–${route.dayRange.max}`;
  return <article className={styles.inspirationCard}>
    <Link href={route.href} aria-label={`${route.title} · ${days} ${es ? "días" : "days"} · ${route.stops.length} ${es ? "paradas" : "stops"}`}>
      <span className={styles.inspirationPhoto}>
        {photo ? <ResilientImage key={photo.variants[0]?.src} src={photo.variants.at(-1)?.src ?? photo.variants[0]?.src} srcSet={photo.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ")} sizes="(max-width: 520px) 100vw, (max-width: 1024px) 33vw, 220px" width={768} height={512} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.focalPosition ?? "center" }} onError={() => setPhotoIndex((index) => index + 1)} fallback={<span className={styles.photoFallback}>{route.title}</span>} /> : <span className={styles.photoFallback}>{route.title}</span>}
      </span>
      <span className={styles.inspirationTitle}>{route.title}</span>
      <span className={styles.inspirationMeta}>{days} {es ? "días" : "days"}{" · "}{route.stops.length} {es ? "paradas" : "stops"}</span>
    </Link>
    {photo ? <MorroviaPhotoCredit className={styles.inspirationCredit} placement="top-right" photoLabel={photo.photoLabel} credit={photo.credit} sourceHref={photo.sourceHref} licenseHref={photo.licenseHref} fullCreditHref={photo.fullCreditHref} /> : null}
  </article>;
}

export default function HomepageRouteInspiration({ routes }: { routes: ImmersiveRoute[] }) {
  const es = useHomepageLanguage() === "es";

  return <section id="routes" className={styles.inspiration} aria-labelledby="homepage-inspiration-heading">
    <header className={styles.inspirationHeading}>
      <div>
        <span className={styles.eyebrow}>{es ? "Inspiración para tu viaje" : "Trip inspiration"}</span>
        <h2 id="homepage-inspiration-heading">{es ? "¿No sabes adónde ir?" : "Not sure where to go?"}</h2>
      </div>
      <div>
        <p>{es ? "Empieza con una de estas rutas y luego hazla tuya." : "Start with one of these routes, then make it yours."}</p>
        <Link className={styles.inspirationCatalogue} href="/journey/discover">{es ? "Ver todas las rutas" : "View all routes"}<ArrowRight aria-hidden="true" /></Link>
      </div>
    </header>
    {routes.length > 0 ? <div className={styles.inspirationGrid}>
      {routes.map((route) => <HomepageRouteCard key={route.key} route={route} es={es} />)}
    </div> : null}
  </section>;
}
