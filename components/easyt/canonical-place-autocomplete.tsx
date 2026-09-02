"use client";

import { MapPin, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import {
  canonicalPlaceSuggestionsForQuery,
  placeCandidateSuitableAsNearbyBase,
  placeCandidateWithinPlanningParent,
  type CanonicalPlaceSuggestion,
  type NearbyBaseAnchor,
  type PlaceType,
  type PlanningParentConstraint,
} from "@/lib/easyt/place-intelligence";
import { placeAutocompleteKeyAction } from "@/lib/easyt/place-autocomplete";
import { EasyTButton } from "./easyt-controls";
import styles from "./canonical-place-autocomplete.module.css";

const placeTypeLabel = (type: PlaceType) => ({
  continent: "Continent", country: "Country", macro_region: "Macro-region", region: "Region", sub_region: "Sub-region", island: "Island",
  archipelago: "Archipelago", city: "City", town: "Town", natural_area: "Natural area", coast: "Coast",
  mountain_range: "Mountain range", valley: "Valley", travel_corridor: "Travel corridor", landmark: "Landmark",
  transport_gateway: "Transport gateway", unknown: "Place to confirm",
}[type]);

export function CanonicalPlaceAutocomplete({
  label,
  value,
  placeholder,
  contextCountries,
  parentConstraint,
  nearbyAnchor,
  allowedPlaceTypes,
  searchIntent = "route-stop",
  excludeCanonicalIds = [],
  emptyMessage = "No matching places found. Try the place with its country.",
  failureMessage = "Place search is temporarily unavailable.",
  showPlaceType = true,
  autoFocus = false,
  disabled = false,
  invalid = false,
  describedBy,
  clearLabel,
  onChange,
  onClear,
  onSelect,
  onSubmitFreeText,
}: {
  label: string;
  value: string;
  placeholder: string;
  contextCountries?: string[];
  parentConstraint?: PlanningParentConstraint;
  nearbyAnchor?: NearbyBaseAnchor;
  allowedPlaceTypes?: PlaceType[];
  searchIntent?: "route-stop" | "planning-area" | "anchor" | "unknown";
  excludeCanonicalIds?: string[];
  emptyMessage?: string;
  failureMessage?: string;
  showPlaceType?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  clearLabel?: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  onSelect: (suggestion: CanonicalPlaceSuggestion) => void;
  onSubmitFreeText?: () => void;
}) {
  const listId = useId();
  const deferredValue = useDeferredValue(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [providerSuggestions, setProviderSuggestions] = useState<CanonicalPlaceSuggestion[]>([]);
  const [providerSearching, setProviderSearching] = useState(false);
  const [providerFailed, setProviderFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const allowedTypeKey = (allowedPlaceTypes ?? []).join("|");
  const parentConstraintKey = JSON.stringify(parentConstraint ?? null);
  const nearbyAnchorKey = JSON.stringify(nearbyAnchor ?? null);
  const catalogSuggestions = useMemo(() => canonicalPlaceSuggestionsForQuery(deferredValue, contextCountries)
    .filter((suggestion) => !excludeCanonicalIds.includes(suggestion.canonicalPlaceId))
    .filter((suggestion) => !allowedPlaceTypes?.length || allowedPlaceTypes.includes(suggestion.placeType))
    .filter((suggestion) => !nearbyAnchor || Boolean(placeCandidateSuitableAsNearbyBase(nearbyAnchor, {
      providerId: suggestion.canonicalPlaceId,
      canonicalName: suggestion.name,
      placeType: suggestion.placeType,
      parentCountries: [suggestion.country],
      parentRegionId: suggestion.region,
      coordinates: suggestion.coordinates,
      routability: suggestion.routability ?? "direct_destination",
    })))
    .filter((suggestion) => !parentConstraint || placeCandidateWithinPlanningParent({
      canonicalName: suggestion.name,
      placeType: suggestion.placeType,
      parentCountries: [suggestion.country],
      parentRegionId: suggestion.region,
      coordinates: suggestion.coordinates,
    }, parentConstraint)), [allowedPlaceTypes, contextCountries, deferredValue, excludeCanonicalIds, nearbyAnchor, parentConstraint]);

  useEffect(() => {
    const query = deferredValue.trim();
    if (query.length < 2) { setProviderSuggestions([]); setProviderSearching(false); setProviderFailed(false); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setProviderSearching(true);
      setProviderFailed(false);
      const country = parentConstraint?.parentCountries.length === 1
        ? parentConstraint.parentCountries[0]
        : contextCountries?.length === 1 ? contextCountries[0] : undefined;
      const params = new URLSearchParams({ place: query, candidates: "1" });
      params.set("intent", searchIntent);
      if (country) params.set("country", country);
      if (parentConstraint) {
        params.set("parentName", parentConstraint.canonicalName);
        params.set("parentType", parentConstraint.placeType);
        if (parentConstraint.canonicalPlaceId) params.set("parentId", parentConstraint.canonicalPlaceId);
        parentConstraint.parentCountries.forEach((parentCountry) => params.append("parentCountry", parentCountry));
        if (parentConstraint.bounds) {
          params.set("parentSouth", String(parentConstraint.bounds.south));
          params.set("parentWest", String(parentConstraint.bounds.west));
          params.set("parentNorth", String(parentConstraint.bounds.north));
          params.set("parentEast", String(parentConstraint.bounds.east));
        }
      }
      if (nearbyAnchor?.coordinates) {
        params.set("nearbyBaseSearch", "1");
        params.set("anchorName", nearbyAnchor.canonicalName);
        params.set("anchorType", nearbyAnchor.placeType);
        if (nearbyAnchor.canonicalPlaceId) params.set("anchorId", nearbyAnchor.canonicalPlaceId);
        nearbyAnchor.parentCountries.forEach((anchorCountry) => params.append("anchorCountry", anchorCountry));
        if (nearbyAnchor.parentRegionId) params.set("anchorRegion", nearbyAnchor.parentRegionId);
        params.set("anchorLon", String(nearbyAnchor.coordinates[0]));
        params.set("anchorLat", String(nearbyAnchor.coordinates[1]));
      }
      fetch(`/api/journey-geocode?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("place search unavailable");
          return response.json() as Promise<{ candidates?: Array<{
            canonicalPlaceId?: string;
            name: string;
            country: string;
            region?: string;
            providerId?: string;
            providerSourceLabel?: string;
            coordinates: [number, number];
            bounds?: CanonicalPlaceSuggestion["bounds"];
            placeType?: PlaceType;
            kind?: string;
            routability?: CanonicalPlaceSuggestion["routability"];
          }> }>;
        })
        .then((payload) => setProviderSuggestions((payload.candidates ?? []).map((candidate) => {
          const kind = (candidate.kind ?? "").toLocaleLowerCase();
          const placeType = candidate.placeType ?? (/continent/.test(kind) ? "continent" as const
            : /country/.test(kind) ? "country" as const
              : /city/.test(kind) ? "city" as const
                : /town|village|hamlet|municipality/.test(kind) ? "town" as const
                  : /island/.test(kind) ? "island" as const
                    : /lake|park|reserve/.test(kind) ? "natural_area" as const
                      : /attraction|historic|monument|museum|archaeological/.test(kind) ? "landmark" as const
                        : /state|province|region|county|administrative/.test(kind) ? "region" as const
                          : "unknown" as const);
          const canonicalPlaceId = candidate.canonicalPlaceId ?? (candidate.providerId ? `open-world:${candidate.providerId}` : `provider:${candidate.country}:${candidate.name}`);
          return {
            canonicalPlaceId,
            name: candidate.name,
            label: `${candidate.name}${candidate.region ? ` · ${candidate.region}` : ""}, ${candidate.country}`,
            country: candidate.country,
            region: candidate.region,
            placeType,
            coordinates: candidate.coordinates,
            bounds: candidate.bounds,
            routability: candidate.routability,
            provenance: [{ id: canonicalPlaceId, label: candidate.providerSourceLabel ?? "Global place provider", kind: "provider" as const, supports: "Global place-search candidate selected by the traveller." }],
          };
        }).filter((suggestion) => !allowedPlaceTypes?.length || allowedPlaceTypes.includes(suggestion.placeType))
          .filter((suggestion) => !nearbyAnchor || Boolean(placeCandidateSuitableAsNearbyBase(nearbyAnchor, {
            providerId: suggestion.canonicalPlaceId,
            canonicalName: suggestion.name,
            placeType: suggestion.placeType,
            parentCountries: [suggestion.country],
            parentRegionId: suggestion.region,
            coordinates: suggestion.coordinates,
            routability: suggestion.routability ?? "direct_destination",
          })))))
        .catch((error) => {
          if ((error as { name?: string }).name === "AbortError") return;
          setProviderSuggestions([]);
          setProviderFailed(true);
        })
        .finally(() => setProviderSearching(false));
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [allowedTypeKey, contextCountries, deferredValue, nearbyAnchorKey, parentConstraintKey, retryNonce, searchIntent]);

  const suggestions = useMemo(() => [...catalogSuggestions, ...providerSuggestions]
    .filter((suggestion) => !excludeCanonicalIds.includes(suggestion.canonicalPlaceId))
    .filter((suggestion, index, all) => all.findIndex((candidate) => candidate.canonicalPlaceId === suggestion.canonicalPlaceId
      || (candidate.name.toLocaleLowerCase() === suggestion.name.toLocaleLowerCase() && candidate.country === suggestion.country)) === index)
    .slice(0, 8), [catalogSuggestions, excludeCanonicalIds, providerSuggestions]);
  const searching = value !== deferredValue || providerSearching;
  const choose = (suggestion: CanonicalPlaceSuggestion) => {
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  return <div className={`${styles.root} ${onClear && value ? styles.hasClear : ""}`}>
    {/* morrovia-ui-audit-allow-next-line native-control -- The shared ARIA combobox owns active-descendant, listbox and free-text keyboard behaviour that EasyTField does not expose. */}
    <input
      autoFocus={autoFocus}
      disabled={disabled}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={open ? listId : undefined}
      aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      onFocus={() => setOpen(true)}
      onBlur={() => window.setTimeout(() => setOpen(false), 100)}
      onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
      onKeyDown={(event) => {
        const result = placeAutocompleteKeyAction(event.key, activeIndex, suggestions.length);
        if (result.activeIndex !== activeIndex || result.choose || result.close) event.preventDefault();
        setActiveIndex(result.activeIndex);
        if (result.choose) choose(suggestions[result.activeIndex]!);
        else if (event.key === "Enter" && onSubmitFreeText) { event.preventDefault(); onSubmitFreeText(); }
        if (result.close) setOpen(false);
      }}
    />
    {onClear && value ? <EasyTButton
      className={styles.clear}
      icon={X}
      iconOnly
      variant="quiet"
      size="small"
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => { onClear(); setOpen(false); setActiveIndex(-1); }}
    >{clearLabel ?? `Clear ${label}`}</EasyTButton> : null}
    {open && value.trim().length >= 2 ? <div id={listId} role="listbox" className={styles.menu}>
      {searching && !suggestions.length ? <p role="status">Searching places…</p> : suggestions.length ? suggestions.map((suggestion, index) => (
        /* morrovia-ui-audit-allow-next-line native-control -- Listbox options require role=option and aria-selected semantics rather than the standard action-button contract. */
        <button
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        id={`${listId}-${index}`}
        key={suggestion.canonicalPlaceId}
        className={index === activeIndex ? styles.optionOn : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(suggestion)}
      ><MapPin aria-hidden="true" /><span><b>{suggestion.name}</b><small>{suggestion.region ? `${suggestion.region} · ` : ""}{suggestion.country}{showPlaceType ? ` · ${placeTypeLabel(suggestion.placeType)}` : ""}</small></span></button>)) : providerFailed ? <div className={styles.failure} role="alert"><p>{failureMessage}</p><EasyTButton variant="secondary" size="small" onMouseDown={(event) => event.preventDefault()} onClick={() => setRetryNonce((current) => current + 1)}>Retry</EasyTButton></div> : <p role="status">{emptyMessage}</p>}
    </div> : null}
  </div>;
}
