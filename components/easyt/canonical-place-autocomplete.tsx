"use client";

import { type CompletedPlaceSearchResult, publicPlaceQueryAllowed, submittedPublicPlaceInput } from '@/lib/easyt/public-place-search-input';
import { MapPin, X } from "lucide-react";
import { useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  canonicalPlaceSuggestionsForQuery,
  placeCandidateSuitableAsNearbyBase,
  placeCandidateWithinPlanningParent,
  type CanonicalPlaceSuggestion,
  type NearbyBaseAnchor,
  type PlaceType,
  type PlanningParentConstraint,
} from "@/lib/easyt/place-intelligence";
import { placeAutocompleteKeyAction, prioritizeRouteStopSuggestions, mergeEquivalentPlaceSuggestions, placeSuggestionLocationDetail, placeSuggestionMapUrl } from "@/lib/easyt/place-autocomplete";
import { consolidateFreshDestinationSuggestions } from "@/lib/easyt/destination-planning-policy";
import { withProviderTimeout } from "@/lib/easyt/provider-timeout";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import {referenceKnownCodeKind,referenceGeographicAcceptanceMatches} from '@/lib/easyt/place-reference';
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import { EasyTButton } from "./easyt-controls";
import {MorroviaPlaceDataCredit} from './morrovia-place-data-credit';
import styles from "./canonical-place-autocomplete.module.css";

const placeTypeLabel = (type: PlaceType, language: EasyTLanguage) => (language === "es" ? {
  continent: "Continente", country: "País", macro_region: "Macrorregión", region: "Región", sub_region: "Subregión", island: "Isla",
  archipelago: "Archipiélago", city: "Ciudad", town: "Población", natural_area: "Área natural", coast: "Costa",
  mountain_range: "Cordillera", valley: "Valle", travel_corridor: "Corredor de viaje", landmark: "Lugar de interés",
  transport_gateway: "Centro de transporte", unknown: "Lugar por confirmar",
} : {
  continent: "Continent", country: "Country", macro_region: "Macro-region", region: "Region", sub_region: "Sub-region", island: "Island",
  archipelago: "Archipelago", city: "City", town: "Town", natural_area: "Natural area", coast: "Coast",
  mountain_range: "Mountain range", valley: "Valley", travel_corridor: "Travel corridor", landmark: "Landmark",
  transport_gateway: "Transport gateway", unknown: "Place to confirm",
})[type];

export function CanonicalPlaceAutocomplete({
  id,
  language = "en",
  label,
  value,
  placeholder,
  contextCountries,
  includeNonRoutable = false,
  parentConstraint,
  nearbyAnchor,
  allowedPlaceTypes,
  requireCoordinates = false,
  searchIntent = "route-stop",
  excludeCanonicalIds = [],
  emptyMessage,
  failureMessage,
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
  onFreeTextSearch,
  onPublicPlaceSearch,
  submitFreeTextOnBlur = false,
  revealSuggestionsKey,
  menuPlacement = "overlay",
}: {
  id?: string;
  language?: EasyTLanguage;
  label: string;
  value: string;
  placeholder: string;
  contextCountries?: string[];
  /** Discovery can browse reviewed canonical anchors without making them route stops. */
  includeNonRoutable?: boolean;
  parentConstraint?: PlanningParentConstraint;
  nearbyAnchor?: NearbyBaseAnchor;
  allowedPlaceTypes?: PlaceType[];
  requireCoordinates?: boolean;
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
  /** Explicit search runs only after Enter; it never participates in keystroke autocomplete. */
  onFreeTextSearch?: (query: string, signal: AbortSignal) => Promise<CanonicalPlaceSuggestion[] | CompletedPlaceSearchResult>;
  /** Separate public-name research action offered only after a completed miss. */
  onPublicPlaceSearch?: (query: string, signal: AbortSignal) => Promise<CanonicalPlaceSuggestion[] | CompletedPlaceSearchResult>;
  submitFreeTextOnBlur?: boolean;
  revealSuggestionsKey?: number;
  /** Inline placement keeps the list reachable inside a scrolling modal. */
  menuPlacement?: "overlay" | "inline";
}) {
  const resolvedEmptyMessage = emptyMessage ?? (language === "es" ? "No encontramos lugares coincidentes. Prueba el lugar con su país." : "No matching places found. Try the place with its country.");
  const resolvedFailureMessage = failureMessage ?? (language === "es" ? "La búsqueda de lugares no está disponible temporalmente." : "Place search is temporarily unavailable.");
  const listId = useId();
  const deferredValue = useDeferredValue(value);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [providerSuggestions, setProviderSuggestions] = useState<(CanonicalPlaceSuggestion & { matchedAirportCode?: string;matchedIcaoCode?:string })[]>([]);
  const [providerSearching, setProviderSearching] = useState(false);
  const [providerFailed, setProviderFailed] = useState(false);
  const [completedSuggestions, setCompletedSuggestions] = useState<CanonicalPlaceSuggestion[]>([]);
  const [completedSearchStatus, setCompletedSearchStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const completedSearchRef = useRef<{ sequence: number; controller: AbortController | null }>({ sequence: 0, controller: null });
  const [publicResearchAvailable,setPublicResearchAvailable] = useState(false);
  const [publicResearchUsed, setPublicResearchUsed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  useEffect(() => {
    // Covers clear and parent-driven value changes as well as input events.
    completedSearchRef.current.sequence += 1;
    completedSearchRef.current.controller?.abort();
    completedSearchRef.current.controller = null;
    setCompletedSuggestions([]);
    setCompletedSearchStatus("idle");
    setPublicResearchUsed(false);
    setPublicResearchAvailable(false);
  }, [value]);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const allowedTypeKey = (allowedPlaceTypes ?? []).join("|");
  const contextCountriesKey = JSON.stringify(contextCountries ?? []);
  const parentConstraintKey = JSON.stringify(parentConstraint ?? null);
  const nearbyAnchorKey = JSON.stringify(nearbyAnchor ?? null);
  const catalogSuggestions = useMemo(() => canonicalPlaceSuggestionsForQuery(deferredValue, contextCountries, 8, includeNonRoutable)
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
    }, parentConstraint)), [allowedPlaceTypes, contextCountries, deferredValue, excludeCanonicalIds, includeNonRoutable, nearbyAnchor, parentConstraint]);

  useEffect(() => {
    const query = deferredValue.trim();
    if (query.length < 2) { setProviderSuggestions([]); setProviderSearching(false); setProviderFailed(false); return; }
    const scope = createAbortableEffectScope("canonical place autocomplete");
    const timer = window.setTimeout(() => {
      scope.commit(() => {
        setProviderSearching(true);
        setProviderFailed(false);
      });
      const country = parentConstraint?.parentCountries.length === 1
        ? parentConstraint.parentCountries[0]
        : ['iata','icao'].includes(referenceKnownCodeKind(query)??'')?undefined:contextCountries?.length === 1 ? contextCountries[0] : undefined;
      const params = new URLSearchParams({ place: query, candidates: "1",mode:'autocomplete' });
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
      withProviderTimeout({ label: "Place search", timeoutMs: 20_000, signal: scope.signal, request: async (signal) => {
          const response = await fetch(`/api/journey-geocode?${params}`, { signal });
          if (!response.ok) throw new Error("place search unavailable");
          return response.json() as Promise<{ candidates?: Array<{
            canonicalPlaceId?: string;
            name: string;
            country: string;
            region?: string;
            administrativeHierarchy?: string[];
            accessPlaceName?: string;
            providerId?: string;
            referenceSnapshotId?: string;
            providerSourceLabel?: string;
            normalizationReason?: string;
            matchedAirportCode?: string;
            matchedIcaoCode?: string;
            scheduledService?:boolean;
            coordinates: [number, number];
            bounds?: CanonicalPlaceSuggestion["bounds"];
            placeType?: PlaceType;
            kind?: string;
            routability?: CanonicalPlaceSuggestion["routability"];
          }> }>;
        } })
        .then((payload) => {
          const nextSuggestions = (payload.candidates ?? []).filter(referenceGeographicAcceptanceMatches).map((candidate) => {
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
              referenceSnapshotId:candidate.referenceSnapshotId,
              name: candidate.name,
              matchedAirportCode: candidate.matchedAirportCode,
              matchedIcaoCode: candidate.matchedIcaoCode,
              scheduledService:candidate.scheduledService,
              label: `${candidate.name}${candidate.region ? ` · ${candidate.region}` : ""}, ${candidate.country}`,
              country: candidate.country,
              region: candidate.region,
              administrativeHierarchy: candidate.administrativeHierarchy,
              accessPlaceName: candidate.accessPlaceName,
              placeType,
              coordinates: candidate.coordinates,
              bounds: candidate.bounds,
              routability: candidate.routability,
              provenance: [{ id: candidate.providerId??canonicalPlaceId, label: candidate.providerSourceLabel ?? "Global place provider", kind: "provider" as const, supports: candidate.normalizationReason ?? "Global place-search candidate selected by the traveller." }],
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
            })));
          scope.commit(() => setProviderSuggestions(nextSuggestions));
        })
        .catch((error) => {
          if (scope.isCancellation(error)) return;
          scope.commit(() => {
            setProviderSuggestions([]);
            setProviderFailed(true);
          });
        })
        .finally(() => scope.commit(() => setProviderSearching(false)));
    }, 220);
    return () => { window.clearTimeout(timer); scope.dispose(); };
  }, [allowedTypeKey, contextCountriesKey, deferredValue, nearbyAnchorKey, parentConstraintKey, retryNonce, searchIntent]);

  const suggestions = useMemo(() => prioritizeRouteStopSuggestions(consolidateFreshDestinationSuggestions(mergeEquivalentPlaceSuggestions([...catalogSuggestions, ...providerSuggestions, ...completedSuggestions]
    .filter((suggestion) => !excludeCanonicalIds.includes(suggestion.canonicalPlaceId))
    .filter((suggestion) => !requireCoordinates || Boolean(suggestion.coordinates))
    ), { intent: searchIntent === "route-stop" ? "fresh-stop" : "explicit-area" })
    , searchIntent, deferredValue).slice(0, 8), [catalogSuggestions, completedSuggestions, excludeCanonicalIds, providerSuggestions, requireCoordinates, searchIntent, deferredValue]);
  const optionKeys = useMemo(() => {
    // Conflicting source tuples remain selectable even when their canonical ID
    // agrees. React identity must follow the complete choice, not that ID alone.
    const occurrences = new Map<string, number>();
    return suggestions.map((suggestion) => {
      const identity = JSON.stringify(suggestion);
      const occurrence = occurrences.get(identity) ?? 0;
      occurrences.set(identity, occurrence + 1);
      return `${identity}:${occurrence}`;
    });
  }, [suggestions]);
  const searching = value !== deferredValue || providerSearching || completedSearchStatus === "loading";
  const runCompletedSearch = (query = inputRef.current?.value.trim() ?? value.trim(), publicResearch = false) => {
    const search = publicResearch ? onPublicPlaceSearch : onFreeTextSearch;
    if (!search || !query) { onSubmitFreeText?.(); return; }
    completedSearchRef.current.controller?.abort();
    const controller = new AbortController();
    const sequence = ++completedSearchRef.current.sequence;
    completedSearchRef.current.controller = controller;
    setCompletedSearchStatus("loading");
    setCompletedSuggestions([]);
    setOpen(true);
    setActiveIndex(-1);
    if (publicResearch) setPublicResearchUsed(true);
    void search(query, controller.signal).then((results) => {
      if (controller.signal.aborted || completedSearchRef.current.sequence !== sequence
        || inputRef.current?.value.trim() !== query) return;
      setPublicResearchAvailable(!Array.isArray(results) && results.publicResearchAvailable===true);
      const accepted = (Array.isArray(results)?results:results.suggestions)
        .filter(referenceGeographicAcceptanceMatches)
        .filter((suggestion) => !excludeCanonicalIds.includes(suggestion.canonicalPlaceId))
        .filter((suggestion) => !allowedPlaceTypes?.length || allowedPlaceTypes.includes(suggestion.placeType))
        .filter((suggestion) => !requireCoordinates || Boolean(suggestion.coordinates))
        .filter((suggestion) => !nearbyAnchor || Boolean(placeCandidateSuitableAsNearbyBase(nearbyAnchor, {
          providerId: suggestion.canonicalPlaceId, canonicalName: suggestion.name, placeType: suggestion.placeType,
          parentCountries: [suggestion.country], parentRegionId: suggestion.region, coordinates: suggestion.coordinates,
          routability: suggestion.routability ?? "direct_destination",
        })))
        .filter((suggestion) => !parentConstraint || placeCandidateWithinPlanningParent({
          canonicalName: suggestion.name, placeType: suggestion.placeType, parentCountries: [suggestion.country],
          parentRegionId: suggestion.region, coordinates: suggestion.coordinates,
        }, parentConstraint));
      setCompletedSuggestions(accepted);
      setCompletedSearchStatus("ready");
      setProviderFailed(false);
      setOpen(true);
    }).catch((error: unknown) => {
      if (controller.signal.aborted || completedSearchRef.current.sequence !== sequence) return;
      setCompletedSearchStatus("failed");
      setProviderFailed(true);
    }).finally(() => {
      if (completedSearchRef.current.sequence === sequence) completedSearchRef.current.controller = null;
    });
  };
  useEffect(() => () => {
    completedSearchRef.current.sequence += 1;
    completedSearchRef.current.controller?.abort();
  }, []);
  const choose = (suggestion: CanonicalPlaceSuggestion) => {
    completedSearchRef.current.sequence += 1;
    completedSearchRef.current.controller?.abort();
    onSelect(suggestion);
    setOpen(false);
    setActiveIndex(-1);
  };

  useEffect(() => {
    if (!revealSuggestionsKey) return;
    inputRef.current?.focus();
    setOpen(true);
  }, [revealSuggestionsKey]);
  const publicInput=submittedPublicPlaceInput(value.trim());
  const canResearchPublicPlace=publicPlaceQueryAllowed(publicInput.query,publicInput.country);
  const mapChoice = activeIndex >= 0 ? suggestions[activeIndex] : suggestions.find(suggestion => placeSuggestionMapUrl(suggestion,suggestions));
  const mapHref = mapChoice ? placeSuggestionMapUrl(mapChoice,suggestions) : null;

  return <div ref={rootRef} className={`${styles.root} ${onClear && value ? styles.hasClear : ""}`}
    onBlur={(event) => {
      if (event.currentTarget.contains(event.relatedTarget)) return;
      window.setTimeout(() => {
        if (rootRef.current?.contains(document.activeElement)) return;
        setOpen(false);
        if (submitFreeTextOnBlur) runCompletedSearch();
      }, 100);
    }}>
    {/* morrovia-ui-audit-allow-next-line native-control -- The shared ARIA combobox owns active-descendant, listbox and free-text keyboard behaviour that EasyTField does not expose. */}
    <input
      ref={inputRef}
      id={id}
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
      onChange={(event) => {
        completedSearchRef.current.sequence += 1;
        completedSearchRef.current.controller?.abort();
        completedSearchRef.current.controller = null;
        setCompletedSuggestions([]);
        setCompletedSearchStatus("idle");
        setPublicResearchUsed(false);
        onChange(event.target.value);
        setOpen(true);
        setActiveIndex(-1);
      }}
      onKeyDown={(event) => {
        const result = placeAutocompleteKeyAction(event.key, activeIndex, suggestions.length);
        if (result.activeIndex !== activeIndex || result.choose || result.close) event.preventDefault();
        setActiveIndex(result.activeIndex);
        if (result.choose) choose(suggestions[result.activeIndex]!);
        else if (event.key === "Enter" && (onSubmitFreeText || onFreeTextSearch)) { event.preventDefault(); runCompletedSearch(); }
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
    {open && value.trim().length >= 2 ? <div className={`${styles.menu} ${menuPlacement === "inline" ? styles.menuInline : ""}`}>
      <div id={listId} role="listbox" className={styles.optionsList}>
      {searching && !suggestions.length ? <p role="status">{language === "es" ? "Buscando lugares…" : "Searching places…"}</p> : suggestions.length ? suggestions.map((suggestion, index) => (
        /* morrovia-ui-audit-allow-next-line native-control -- Listbox options require role=option and aria-selected semantics rather than the standard action-button contract. */
        <button
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        id={`${listId}-${index}`}
        key={optionKeys[index]}
        className={index === activeIndex ? styles.optionOn : undefined}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => choose(suggestion)}
      ><MapPin aria-hidden="true" /><span><b>{suggestion.name}</b><small>{[placeSuggestionLocationDetail(suggestion,suggestions,language),showPlaceType ? placeTypeLabel(suggestion.placeType,language):null].filter(Boolean).join(' · ')}</small>{suggestion.scheduledService===false ? <small>{language==="es"?"No consta servicio regular de pasajeros":"No scheduled passenger service recorded"}</small>:null}</span></button>)) : providerFailed ? <div className={styles.failure} role="alert"><p>{resolvedFailureMessage}</p><EasyTButton variant="secondary" size="small" onMouseDown={(event) => event.preventDefault()} onClick={() => {
        if (completedSearchStatus === "failed" && onFreeTextSearch) runCompletedSearch();
        else setRetryNonce((current) => current + 1);
      }}>{language === "es" ? "Reintentar" : "Retry"}</EasyTButton></div> : <p role="status">{resolvedEmptyMessage}</p>}
      </div>
      {!searching && !suggestions.length && !providerFailed && completedSearchStatus === "ready" && onPublicPlaceSearch && publicResearchAvailable && canResearchPublicPlace && !publicResearchUsed ? <div className={styles.failure}>
        <p>{language === "es" ? "Pedir a OpenAI otros nombres de este lugar público. No incluyas direcciones ni datos personales." : "Ask OpenAI for alternative names of this public place. No addresses or personal details."}</p>
        <EasyTButton variant="secondary" size="small" disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => runCompletedSearch(undefined,true)}>{language === "es" ? "Buscar nombres de lugares públicos" : "Search public place names"}</EasyTButton>
      </div> : null}
      {mapChoice && mapHref ? <a className={styles.mapChoice} href={mapHref} target="_blank" rel="noopener noreferrer" aria-label={`${language === "es" ? "Ver en mapa" : "View on map"}: ${mapChoice.name}, ${placeSuggestionLocationDetail(mapChoice,suggestions,language)}`}>{language === "es" ? `Ver ${placeSuggestionLocationDetail(mapChoice,suggestions,language)} en el mapa` : `View ${placeSuggestionLocationDetail(mapChoice,suggestions,language)} on map`}</a> : null}
      <MorroviaPlaceDataCredit language={language} sources={[
        ...(suggestions.some(s=>s.provenance.some(p=>p.id.startsWith('reference:geonames:')))?['geonames' as const]:[]),
        ...(suggestions.some(s=>s.provenance.some(p=>p.id.startsWith('reference:ourairports:')))?['ourairports' as const]:[]),
        ...(suggestions.some(s=>s.provenance.some(p=>/^(photon:|nominatim:|openstreetmap:|island-snapshot:)/.test(p.id)||p.supports.startsWith('Physical island verified: OSM ')))?['openstreetmap' as const]:[]),
      ]}/>
    </div> : null}
  </div>;
}
