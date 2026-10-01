"use client";

import { useEffect, useRef, useState } from "react";
import {
  createGoogleTripMapSession,
  loadGoogleMapsSdk,
  type GoogleCanvasLeg,
  type GoogleCanvasStop,
  type GoogleCanvasPlace,
  type GoogleMapInsets,
  type GoogleTripMapApi,
} from "@/lib/easyt/google-trip-map-adapter";
import presentation from "./morrovia-map-presentation.module.css";
import { trackEvent } from "@/lib/analytics";

type Props = {
  browserKey: string;
  mapId?: string;
  stops: readonly GoogleCanvasStop[];
  legs: readonly GoogleCanvasLeg[];
  places?: readonly GoogleCanvasPlace[];
  selectedStopId: string | null;
  selectedPlaceId?: string | null;
  previewPlaceId?: string | null;
  temporaryPlace?: GoogleCanvasPlace | null;
  cameraInsets?: GoogleMapInsets;
  onNativePoi(placeId: string, coordinates?: [number, number]): boolean | void;
  onEmptyClick(point: [number, number]): void;
  onSelectStop(stopId: string): void;
  onSelectLeg(legId: string): void;
  onSelectPlace?(placeId: string): void;
  onPreviewPlace?(placeId: string | null): void;
  onUnavailable(): void;
  /** Storybook-only SDK boundary; the production parent uses the browser loader. */
  sdkLoader?: (key: string) => Promise<GoogleTripMapApi>;
};

/** Browser canvas only. JourneyMapPlannerWorkspace owns every selection and trip mutation. */
export function GoogleTripMapCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<ReturnType<typeof createGoogleTripMapSession> | null>(null);
  const callbacksRef = useRef(props);
  callbacksRef.current = props;
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const stopKey = props.stops.map((stop) => `${stop.id}:${stop.coordinates?.join(",") ?? ""}`).join("|");
  const legKey = props.legs.map((leg) => `${leg.id}:${leg.fromStopId}:${leg.toStopId}`).join("|");
  const placeKey = props.places?.map((place) => `${place.id}:${place.category}:${place.coordinates.join(",")}`).join("|") ?? "";
  const temporaryKey = props.temporaryPlace ? `${props.temporaryPlace.id}:${props.temporaryPlace.coordinates.join(",")}` : "";

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    let active = true;
    setStatus("loading");
    trackEvent("map_google_request", { operation: "sdk", outcome: "started" });
    void (props.sdkLoader ?? loadGoogleMapsSdk)(props.browserKey)
      .then((api) => {
        if (!active) return;
        sessionRef.current = createGoogleTripMapSession(api, element, {
          stops: props.stops,
          legs: props.legs,
          selectedStopId: props.selectedStopId,
          cameraInsets: props.cameraInsets,
          mapId: props.mapId,
          onNativePoi: (placeId, coordinates) => callbacksRef.current.onNativePoi(placeId, coordinates),
          onEmptyClick: (point) => callbacksRef.current.onEmptyClick(point),
          onSelectStop: (stopId) => callbacksRef.current.onSelectStop(stopId),
          onSelectLeg: (legId) => callbacksRef.current.onSelectLeg(legId),
          onSelectPlace: (placeId) => callbacksRef.current.onSelectPlace?.(placeId),
          onPreviewPlace: (placeId) => callbacksRef.current.onPreviewPlace?.(placeId),
        });
        sessionRef.current.updatePlaces(callbacksRef.current.places ?? [], callbacksRef.current.selectedPlaceId, callbacksRef.current.temporaryPlace, callbacksRef.current.cameraInsets);
        setStatus("ready");
        trackEvent("map_google_request", { operation: "sdk", outcome: "success" });
      })
      .catch(() => { if (active) { setStatus("unavailable"); trackEvent("map_google_request", { operation: "sdk", outcome: "failure", failure_kind: "provider" }); callbacksRef.current.onUnavailable(); } });
    return () => { active = false; sessionRef.current?.destroy(); sessionRef.current = null; };
    // Deliberately keyed to canonical overlay identities, not category or detail state.
  }, [props.browserKey, props.mapId, props.sdkLoader, stopKey, legKey]);

  useEffect(() => { sessionRef.current?.update({ selectedStopId: props.selectedStopId, cameraInsets: props.cameraInsets }); }, [props.selectedStopId, props.cameraInsets]);
  useEffect(() => { sessionRef.current?.updatePlaces(props.places ?? [], props.selectedPlaceId, props.temporaryPlace, props.cameraInsets); }, [placeKey, props.selectedPlaceId, temporaryKey, props.cameraInsets]);
  useEffect(() => { sessionRef.current?.previewPlace(props.previewPlaceId ?? null); }, [props.previewPlaceId]);

  return <div className={`planner-map ${presentation.surface}`} data-basemap-status={status} aria-busy={status === "loading" || undefined} aria-label="Google trip map">
    <div ref={containerRef} className={presentation.canvas} />
    {status === "loading" ? <div className={presentation.basemapStatus} role="status">Opening Google map</div> : null}
    {status === "unavailable" ? <div className={presentation.basemapStatus} role="alert"><strong>Google map unavailable</strong><span>Try reopening the map. Your trip is unchanged.</span></div> : null}
  </div>;
}
