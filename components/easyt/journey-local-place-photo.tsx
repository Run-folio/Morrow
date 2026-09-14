"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { JourneyLocalPlace } from "@/lib/easyt/local-place";
import { decodeGooglePhotoAttributions, type GooglePlacePhotoAttribution } from "@/lib/easyt/google-place-photo";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import ResilientImage from "./resilient-image";

export type JourneyLocalPlacePhoto = {
  src: string;
  attributions: GooglePlacePhotoAttribution[];
};

export function useJourneyLocalPlacePhotos(places: readonly JourneyLocalPlace[]) {
  const exactGooglePlaces = useMemo(() => places.filter((place) => (
    !place.image
    && place.provider === "google-places"
    && Boolean(place.providerProductId)
  )).slice(0, 6), [places]);
  const requestKey = exactGooglePlaces.map((place) => `${place.id}:${place.providerProductId}`).join("|");
  const [photos, setPhotos] = useState<Record<string, JourneyLocalPlacePhoto>>({});

  useEffect(() => {
    const controller = new AbortController();
    const objectUrls: string[] = [];
    setPhotos({});
    void Promise.all(exactGooglePlaces.map(async (place) => {
      try {
        const response = await fetch(`/api/journey-place-photo?${new URLSearchParams({ placeId: place.providerProductId! })}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return;
        const src = URL.createObjectURL(await response.blob());
        objectUrls.push(src);
        if (controller.signal.aborted) return;
        const attributions = decodeGooglePhotoAttributions(response.headers.get("x-morrovia-photo-attribution"));
        setPhotos((current) => ({ ...current, [place.id]: { src, attributions } }));
      } catch {
        // The stable no-image treatment remains visible when a photo is absent,
        // expires, or the independent provider request cannot complete.
      }
    }));
    return () => {
      controller.abort();
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
    // Candidate identity, not late commercial facts, owns photo requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  return photos;
}

export function JourneyLocalPlacePhotoMedia({
  place,
  photo,
  fallback,
}: {
  place: JourneyLocalPlace;
  photo?: JourneyLocalPlacePhoto;
  fallback: ReactNode;
}) {
  const src = place.image ?? photo?.src;
  const credit = photo?.attributions.map((item) => item.displayName).join(" · ") ?? "";
  const sourceHref = photo?.attributions.find((item) => item.uri)?.uri ?? place.mapsUrl;
  return <>
    <ResilientImage src={src} alt={src ? `${place.name} property` : ""} fallback={fallback} loading="lazy" decoding="async" />
    {src && credit ? <MorroviaPhotoCredit credit={credit} photoLabel={place.name} sourceHref={sourceHref} /> : null}
  </>;
}

export function JourneyLocalPlacePhotoAttribution({
  photo,
  className,
}: {
  photo?: JourneyLocalPlacePhoto;
  className?: string;
}) {
  if (!photo?.attributions.length) return null;
  return <p className={className}>
    Property photo: {photo.attributions.map((attribution, index) => <span key={`${attribution.displayName}-${index}`}>
      {index ? " · " : null}
      {attribution.uri
        ? <a href={attribution.uri} target="_blank" rel="noreferrer">{attribution.displayName}</a>
        : attribution.displayName}
    </span>)}
  </p>;
}
