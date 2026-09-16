"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import ResilientImage from "@/components/easyt/resilient-image";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";

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
      {routes.map((route) => {
        const photo = route.photos.find((candidate) => candidate !== null) ?? null;
        const days = route.dayRange.min === route.dayRange.max ? route.dayRange.min : `${route.dayRange.min}–${route.dayRange.max}`;
        return <article className={styles.inspirationCard} key={route.key}>
          <Link href={route.href} aria-label={`${route.title} · ${days} ${es ? "días" : "days"} · ${route.stops.length} ${es ? "paradas" : "stops"}`}>
            <span className={styles.inspirationPhoto}>
              {photo ? <ResilientImage key={photo.key} src={photo.variants[1]?.src ?? photo.variants[0]?.src} srcSet={photo.variants.map((variant) => `${variant.src} ${variant.width}w`).join(", ")} sizes="(max-width: 520px) 100vw, (max-width: 1024px) 33vw, 220px" width={768} height={512} alt="" loading="lazy" decoding="async" fallback={<span className={styles.photoFallback}>{route.title}</span>} /> : <span className={styles.photoFallback}>{route.title}</span>}
            </span>
            <span className={styles.inspirationTitle}>{route.title}</span>
            <span className={styles.inspirationMeta}>{days} {es ? "días" : "days"}{" · "}{route.stops.length} {es ? "paradas" : "stops"}</span>
          </Link>
          {photo ? <MorroviaPhotoCredit className={styles.inspirationCredit} photoLabel={photo.alt} credit={`${photo.author} · ${photo.license}`} sourceHref={photo.sourceUrl} licenseHref={photo.licenseUrl} fullCreditHref={`/journey/immersive/credits.html#${photo.key}`} /> : null}
        </article>;
      })}
    </div> : null}
  </section>;
}
