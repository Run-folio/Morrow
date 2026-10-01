"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useMemo, useRef, useState, type MouseEvent } from "react";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import MorroviaPhotoCredit from "@/components/easyt/morrovia-photo-credit";
import ResilientImage from "@/components/easyt/resilient-image";
import type { ImmersiveRoute } from "@/lib/easyt/immersive-homepage-routes";
import type { DiscoveryRoute } from "@/lib/easyt/discovery-catalogue";
import { useHomepageLanguage } from "./use-homepage-language";
import styles from "./immersive.module.css";
import { homepageRouteCardCloudinaryVariants } from "@/lib/easyt/homepage-cloudinary-image";

const RoutePreview = dynamic(() => import("@/app/journey/discover/route-preview"), { ssr: false });

type InspirationPhoto = {
  credit: string;
  authorHref?: string;
  focalPosition?: string;
  fullCreditHref?: string;
  licenseHref?: string;
  photoLabel: string;
  sourceHref?: string;
  variants: Array<{ src: string; width: number }>;
  cloudinaryOwned?: boolean;
  ownership: "morrovia" | "third-party" | "unknown";
};

function inspirationPhotos(route: ImmersiveRoute, es: boolean): InspirationPhoto[] {
  const hero = route.heroPhoto;
  const heroFallback = route.heroPhoto?.fallback;
  const photo = route.photos.find((candidate) => candidate !== null) ?? null;
  const heroCandidate = (candidate: NonNullable<ImmersiveRoute["heroPhoto"]>): InspirationPhoto => ({
    variants: candidate.variants,
    credit: es ? candidate.creditEs : candidate.credit,
    photoLabel: candidate.country,
    authorHref: candidate.authorUrl,
    sourceHref: candidate.source.startsWith("http") ? candidate.source : undefined,
    fullCreditHref: candidate.firstParty ? undefined : "/journey/immersive/credits.html",
    focalPosition: candidate.focalPosition,
    cloudinaryOwned: candidate.firstParty,
    ownership: candidate.firstParty ? "morrovia" : "third-party",
  });
  return [
    ...(hero ? [heroCandidate(hero)] : []),
    ...(heroFallback ? [heroCandidate(heroFallback)] : []),
    ...(photo ? [{ variants: photo.variants, credit: `${photo.author} · ${photo.license}`, authorHref: photo.authorUrl, photoLabel: photo.alt, sourceHref: photo.sourceUrl, licenseHref: photo.licenseUrl, fullCreditHref: `/journey/immersive/credits.html#${photo.key}`, cloudinaryOwned: photo.provenance === "reviewed-morrovia-first-party", ownership: photo.provenance === "reviewed-morrovia-first-party" ? "morrovia" as const : "third-party" as const }] : []),
  ];
}

function HomepageRouteCard({ route, es, onSelect }: { route: ImmersiveRoute; es: boolean; onSelect: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageDisplayed, setImageDisplayed] = useState(false);
  const photoAnchorRef = useRef<HTMLSpanElement>(null);
  const photo = inspirationPhotos(route, es)[photoIndex];
  const originalImageSrc = photo?.variants.at(-1)?.src ?? photo?.variants[0]?.src;
  const imageVariants = photo?.cloudinaryOwned && originalImageSrc
    ? homepageRouteCardCloudinaryVariants(originalImageSrc)
    : photo?.variants ?? [];
  const days = route.dayRange.min === route.dayRange.max ? route.dayRange.min : `${route.dayRange.min}–${route.dayRange.max}`;
  return <article className={styles.inspirationCard}>
    <EasyTLinkButton href={route.href} prefetch={false} variant="quiet" className={styles.inspirationCardTrigger} aria-label={`${es ? "Vista previa de la ruta" : "Preview route"}: ${route.title} · ${days} ${es ? "días" : "days"} · ${route.stops.length} ${es ? "paradas" : "stops"}`} onClick={onSelect}>
      <span ref={photoAnchorRef} className={styles.inspirationPhoto}>
        {photo ? <ResilientImage key={photo.variants[0]?.src} src={imageVariants.at(-1)?.src ?? originalImageSrc} srcSet={imageVariants.map((variant) => `${variant.src} ${variant.width}w`).join(", ")} sizes="(max-width: 520px) calc((100vw - 46px) / 2), (max-width: 700px) calc((100vw - 44px) / 2), (max-width: 1100px) calc((100vw - 84px) / 4), (max-width: 1448px) calc((100vw - 120px) / 7), 189px" width={768} height={512} alt="" loading="lazy" decoding="async" style={{ objectPosition: photo.focalPosition ?? "center" }} onDisplayState={setImageDisplayed} onError={() => setPhotoIndex((index) => index + 1)} fallback={<span className={styles.photoFallback}>{route.title}</span>} /> : <span className={styles.photoFallback}>{route.title}</span>}
      </span>
      <span className={styles.inspirationTitle}>{route.title}</span>
      <span className={styles.inspirationMeta}>{days} {es ? "días" : "days"}{" · "}{route.stops.length} {es ? "paradas" : "stops"}</span>
    </EasyTLinkButton>
    {photo && photo.ownership !== "morrovia" && imageDisplayed ? <MorroviaPhotoCredit anchorRef={photoAnchorRef} ownership={photo.ownership} className={styles.inspirationCredit} placement="bottom-left" photoLabel={photo.photoLabel} credit={photo.credit} authorHref={photo.authorHref} sourceHref={photo.sourceHref} licenseHref={photo.licenseHref} fullCreditHref={photo.fullCreditHref} /> : null}
  </article>;
}

export default function HomepageRouteInspiration({ routes, previewRoutes }: { routes: ImmersiveRoute[]; previewRoutes: DiscoveryRoute[] }) {
  const es = useHomepageLanguage() === "es";
  const previewByKey = useMemo(() => new Map(previewRoutes.map((route) => [route.key, route])), [previewRoutes]);
  const [selected, setSelected] = useState<DiscoveryRoute | null>(null);

  return <section id="routes" className={styles.inspiration} aria-labelledby="homepage-inspiration-heading">
    <header className={styles.inspirationHeading}>
      <div>
        <span className={styles.eyebrow}>{es ? "Inspiración para tu viaje" : "Trip inspiration"}</span>
        <h2 id="homepage-inspiration-heading">{es ? "¿No sabes adónde ir?" : "Not sure where to go?"}</h2>
        <p>{es ? "Empieza con una de estas rutas y luego hazla tuya." : "Start with one of these routes, then make it yours."}</p>
      </div>
      <Link className={styles.inspirationCatalogue} href="/journey/discover">{es ? "Ver todas las rutas" : "View all routes"}<ArrowRight aria-hidden="true" /></Link>
    </header>
    {routes.length > 0 ? <div className={styles.inspirationGrid}>
      {routes.map((route) => <HomepageRouteCard key={route.key} route={route} es={es} onSelect={(event) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const preview = previewByKey.get(route.key);
        if (!preview) return;
        event.preventDefault();
        setSelected(preview);
      }} />)}
    </div> : null}
    {selected ? <RoutePreview route={selected} onClose={() => setSelected(null)} /> : null}
  </section>;
}
