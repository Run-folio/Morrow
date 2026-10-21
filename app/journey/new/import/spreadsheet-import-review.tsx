"use client";

import { AlertTriangle, Check, ChevronDown, FileSpreadsheet, MapPin, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { MorroviaPlaceDataCredit } from "@/components/easyt/morrovia-place-data-credit";
import { EasyTButton, EasyTField, EasyTSelect } from "@/components/easyt/easyt-controls";
import { MorroviaRecoveryFeedback } from "@/components/easyt/morrovia-feedback";
import { acceptImportPlace, assessImportPlaceCandidates, importCandidateFromSuggestion, importPlaceRequest, importPlanningParent, resolveSpreadsheetImportPlace, verifySpreadsheetImportBase, type ImportPlaceCandidate } from "@/lib/easyt/spreadsheet-import-places";
import {
  spreadsheetImportFieldLabels,
  spreadsheetImportFields,
  type ResolvedImportOrigin,
  type ResolvedImportPlace,
  type SpreadsheetColumnMapping,
  type SpreadsheetImportField,
  type SpreadsheetImportProposal,
} from "@/lib/easyt/spreadsheet-import";
import { formatImportDate, formatImportDateRange, groupSkippedImportIssues, skippedImportSummary } from "./spreadsheet-import-review-presentation";
import styles from "./spreadsheet-import.module.css";

export type SpreadsheetImportPlaceCandidate = ImportPlaceCandidate;

function ImportPlaceClarification({ name, country, options, role = "stop", onSelect }: {
  name: string; country?: string; options: ImportPlaceCandidate[]; role?: "stop" | "endpoint";
  onSelect: (candidate: ImportPlaceCandidate) => void;
}) {
  const [parent, setParent] = useState<ImportPlaceCandidate | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [searchResults, setSearchResults] = useState<ImportPlaceCandidate[] | null>(null);
  const [checking, setChecking] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const invalidate = () => { requestRef.current?.abort(); requestRef.current = null; setChecking(false); };
  const sourceRequest = importPlaceRequest(name, country ?? "");
  const choose = async (candidate: ImportPlaceCandidate) => {
    invalidate(); setError("");
    const planningParent = importPlanningParent(candidate);
    if (planningParent) { setParent(candidate); setSearch(""); setSearchResults(null); return; }
    const controller = new AbortController(); requestRef.current = controller; setChecking(true);
    try {
      const accepted = parent ? await verifySpreadsheetImportBase(candidate, importPlanningParent(parent)!, controller.signal)
        : assessImportPlaceCandidates(sourceRequest, [candidate], role).candidates.length ? acceptImportPlace(candidate, role) : null;
      if (controller.signal.aborted || requestRef.current !== controller) return;
      if (!accepted) { setError(parent ? "This base could not be verified in the selected area. Try again." : role === "stop" ? "Choose a verified city or town matching the imported country and region." : "Choose a verified city or airport."); return; }
      onSelect(accepted);
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) setError("Place checking is unavailable. Try again.");
    } finally { if (requestRef.current === controller) { requestRef.current = null; setChecking(false); } }
  };
  const lookup = async () => {
    invalidate(); setError(""); setSearchResults([]);
    const query = search.trim() || (!parent ? name : "");
    if (!query) return;
    const controller = new AbortController(); requestRef.current = controller; setChecking(true);
    try {
      const result = await resolveSpreadsheetImportPlace(query, parent?.country || sourceRequest.country, role, controller.signal,
        { mode: "resolve", parent: parent ? importPlanningParent(parent) : undefined });
      if (controller.signal.aborted || requestRef.current !== controller) return;
      const candidates = parent ? result.candidates : assessImportPlaceCandidates(sourceRequest, result.candidates, role).candidates;
      setSearchResults(candidates);
      if (!candidates.length) setError("No verified matches found. Try a more specific place.");
    } catch {
      if (!controller.signal.aborted && requestRef.current === controller) setError("Place checking is unavailable. Try again.");
    } finally { if (requestRef.current === controller) { requestRef.current = null; setChecking(false); } }
  };
  const visibleOptions = searchResults ?? (!parent && !search.trim() ? options : []);
  const dataSources: Array<'geonames' | 'ourairports' | 'openstreetmap'> = [];
  if (visibleOptions.some(option => option.providerId?.startsWith('reference:geonames:'))) dataSources.push('geonames');
  if (visibleOptions.some(option => option.providerId?.startsWith('reference:ourairports:'))) dataSources.push('ourairports');
  if (visibleOptions.some(option => /^(photon:|nominatim:|openstreetmap:|island-snapshot:)/.test(option.providerId ?? '') || ('normalizationReason' in option && typeof option.normalizationReason === 'string' && option.normalizationReason.startsWith('Physical island verified: OSM ')))) dataSources.push('openstreetmap');
  return <>
    {visibleOptions.length ? <EasyTSelect label={searchResults ? `Search results for ${search.trim() || name}` : `Meaning of ${name}`} value="" onChange={event => {
      if (event.target.value === "") return;
      const candidate = visibleOptions[Number(event.target.value)];
      if (candidate) void choose(candidate);
    }}><option value="">Choose the intended place…</option>{visibleOptions.map((option, index) => <option key={`${option.canonicalPlaceId}-${index}`} value={index}>
      {[option.name, option.placeType?.replaceAll("_", " "), option.region, option.country].filter(Boolean).join(" · ")}
    </option>)}</EasyTSelect> : null}
    <MorroviaPlaceDataCredit sources={dataSources} />
    {parent ? <><p>Choose where to stay in {parent.name}. The dates and nights stay the same.</p><EasyTButton variant="quiet" onClick={() => { invalidate(); setParent(null); setSearch(""); setSearchResults(null); setError(""); }}>Change area</EasyTButton></> : null}
    <CanonicalPlaceAutocomplete
      label={parent ? `Overnight base in ${parent.name}` : `Search for ${name}`}
      placeholder={parent ? "Search for a city or town" : "Search with country or region"}
      value={search} onChange={value => { invalidate(); setSearch(value); setSearchResults(null); setError(""); }} contextCountries={parent?.country ? [parent.country] : sourceRequest.country ? [sourceRequest.country] : undefined}
      includeNonRoutable={!parent} parentConstraint={parent ? importPlanningParent(parent) : undefined}
      allowedPlaceTypes={parent ? ["city", "town"] : undefined} requireCoordinates={Boolean(parent)}
      menuPlacement="inline" onSelect={suggestion => { void choose(importCandidateFromSuggestion(suggestion)); }} onSubmitFreeText={() => { void lookup(); }}
    />
    <EasyTButton variant="secondary" size="small" loading={checking} disabled={Boolean(parent) && !search.trim()} onClick={() => { void lookup(); }}>{parent ? "Search bases" : "Search places"}</EasyTButton>
    {error ? <p className={styles.placeFailure} role="alert">{error}</p> : null}
  </>;
}

export type SpreadsheetImportReviewProps = {
  proposal: SpreadsheetImportProposal;
  mappings: SpreadsheetColumnMapping[];
  sourceRowCount: number;
  sourceColumnCount: number;
  resolvedPlaces: Record<string, ResolvedImportPlace>;
  placeOptions: Record<string, SpreadsheetImportPlaceCandidate[]>;
  resolvingPlaces: boolean;
  originValue: string;
  resolvedOrigin: ResolvedImportOrigin | null;
  originOptions: SpreadsheetImportPlaceCandidate[];
  originError: string;
  saving: boolean;
  saveError: string;
  canConfirm: boolean;
  onReset: () => void;
  onUpdateMapping: (columnIndex: number, value: string) => void;
  onOriginValueChange: (value: string) => void;
  onResolveOrigin: () => void;
  onSelectOrigin: (candidate: SpreadsheetImportPlaceCandidate) => void;
  onSelectPlace: (stopId: string, candidate: SpreadsheetImportPlaceCandidate) => void;
  onConfirm: () => void;
};

function plural(count: number, singular: string, pluralForm = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function categoryLabel(count: number, label: string) {
  return <span><strong>{label}</strong><small>{plural(count, "item")}</small></span>;
}

function MappingSelect({ mapping, onUpdate }: { mapping: SpreadsheetColumnMapping; onUpdate: (columnIndex: number, value: string) => void }) {
  return <div className={styles.mappingRow} data-state={mapping.state}>
    <div><strong>{mapping.header}</strong><small>{mapping.state === "mapped" ? "Ready" : mapping.state === "ambiguous" ? "Needs your attention" : "Not imported"}</small></div>
    <EasyTSelect label={`Meaning of ${mapping.header}`} labelClassName="sr-only" value={mapping.field ?? "ignore"} onChange={(event) => onUpdate(mapping.index, event.target.value)}>
      <option value="ignore">Do not import</option>
      {spreadsheetImportFields.map((field: SpreadsheetImportField) => <option key={field} value={field}>{spreadsheetImportFieldLabels[field]}</option>)}
    </EasyTSelect>
  </div>;
}

export function SpreadsheetImportReview({
  proposal,
  mappings,
  sourceRowCount,
  sourceColumnCount,
  resolvedPlaces,
  placeOptions,
  resolvingPlaces,
  originValue,
  resolvedOrigin,
  originOptions,
  originError,
  saving,
  saveError,
  canConfirm,
  onReset,
  onUpdateMapping,
  onOriginValueChange,
  onResolveOrigin,
  onSelectOrigin,
  onSelectPlace,
  onConfirm,
}: SpreadsheetImportReviewProps) {
  const stops = proposal.stops;
  const stays = proposal.bookings.filter((booking) => booking.type === "stay");
  const journeys = proposal.bookings.filter((booking) => booking.type === "transport");
  const activities = proposal.activities;
  const notes = proposal.stops.flatMap((stop) => stop.notes.map((note) => ({ ...note, stop: stop.name })));
  const categoryCount = [stays.length, journeys.length, activities.length, notes.length].filter((count) => count > 0).length;
  const ambiguousMappings = mappings.filter((mapping) => mapping.state === "ambiguous");
  const mappedCount = mappings.filter((mapping) => mapping.state === "mapped").length;
  const unresolvedStops = stops.filter((stop) => !resolvedPlaces[stop.id]);
  const attentionIssues = proposal.issues.filter((issue) => issue.status === "needs-review" && issue.columnIndex === undefined && !(issue.id === "origin-conflict" && resolvedOrigin));
  const notImportedIssues = proposal.issues.filter((issue) => issue.status === "not-imported");
  const skippedIssueGroups = groupSkippedImportIssues(notImportedIssues);
  const skippedSummary = skippedImportSummary(skippedIssueGroups);
  const attentionCount = ambiguousMappings.length + attentionIssues.length + (resolvedOrigin ? 0 : 1) + (resolvingPlaces ? 0 : unresolvedStops.length);
  const summary = [
    plural(stops.length, "stop"),
    plural(proposal.totalNights, "night"),
    plural(stays.length, "stay"),
    plural(journeys.length, "journey", "journeys"),
    plural(activities.length, "activity", "activities"),
  ].join(" · ");

  return <>
    <section className={styles.sourceBar} aria-label="Import source">
      <div><FileSpreadsheet aria-hidden="true" /><span><strong>{proposal.sourceName}</strong><small>Spreadsheet ready to review</small></span></div>
      <EasyTButton variant="quiet" size="small" icon={RotateCcw} onClick={onReset}>Change source</EasyTButton>
    </section>

    <section className={styles.reviewPanel} aria-labelledby="import-review-title">
      <header className={styles.reviewHeading}>
        <p>{canConfirm ? "IMPORT READY" : "REVIEW YOUR IMPORT"}</p>
        <h1 id="import-review-title">Review your trip</h1>
        <span>Check the route and anything that needs your attention before Morrovia creates the trip.</span>
        <strong className={styles.summaryLine}>{summary}</strong>
      </header>

      {resolvedOrigin ? <div className={styles.originSummary}><MapPin aria-hidden="true" /><span><small>Starting in</small><strong>{resolvedOrigin.name}{resolvedOrigin.country ? `, ${resolvedOrigin.country}` : ""}</strong></span></div> : null}

      <section className={styles.routeReview} aria-labelledby="route-review-title">
        <div className={styles.subheading}><h2 id="route-review-title">Your route</h2><p>In the same order as your spreadsheet</p></div>
        <ol>{stops.map((stop, index) => <li key={stop.id} data-resolved={Boolean(resolvedPlaces[stop.id])}>
          <b>{index + 1}</b>
          <div><strong>{resolvedPlaces[stop.id]?.name ?? stop.name}{(resolvedPlaces[stop.id]?.country ?? stop.country) ? `, ${resolvedPlaces[stop.id]?.country ?? stop.country}` : ""}</strong>
            {resolvedPlaces[stop.id] && resolvedPlaces[stop.id].name !== stop.name ? <small>Imported as {stop.name}</small> : null}
            <span>{formatImportDateRange(stop.arrivalDate, stop.departureDate)} · {stop.nights === null ? "? nights" : plural(stop.nights, "night")}</span></div>
          {!resolvedPlaces[stop.id] && !resolvingPlaces ? <span className={styles.routeAttention}>Needs your attention</span> : null}
        </li>)}</ol>
      </section>

      {categoryCount ? <section className={styles.categoryReview} aria-label="Trip details">
        {stays.length ? <details><summary>{categoryLabel(stays.length, "Stays")}<ChevronDown aria-hidden="true" /></summary><div>{stays.map((stay) => <p key={stay.id}><strong>{stay.title}</strong><span>{stay.location} · {formatImportDateRange(stay.date, stay.endDate)}</span></p>)}</div></details> : null}
        {journeys.length ? <details><summary>{categoryLabel(journeys.length, "Journeys")}<ChevronDown aria-hidden="true" /></summary><div>{journeys.map((journey) => <p key={journey.id}><strong>{journey.title}</strong><span>{formatImportDate(journey.date)}</span></p>)}</div></details> : null}
        {activities.length ? <details><summary>{categoryLabel(activities.length, "Activities")}<ChevronDown aria-hidden="true" /></summary><div>{activities.map((activity) => <p key={activity.id}><strong>{activity.title}</strong><span>{formatImportDate(activity.date)}</span></p>)}</div></details> : null}
        {notes.length ? <details><summary>{categoryLabel(notes.length, "Notes")}<ChevronDown aria-hidden="true" /></summary><div>{notes.map((note, index) => <p key={`${note.stop}-${note.date}-${index}`}><strong>{note.stop}</strong><span>{note.text}</span></p>)}</div></details> : null}
      </section> : null}

      {(attentionCount > 0 || resolvingPlaces) ? <section className={styles.attentionPanel} aria-labelledby="attention-title" role="status">
        <header><AlertTriangle aria-hidden="true" /><span><p>NEEDS YOUR ATTENTION</p><h2 id="attention-title">{resolvingPlaces ? "Checking your destinations" : plural(attentionCount, "detail needs", "details need")} checking</h2></span></header>

        {!resolvedOrigin ? <div className={styles.attentionItem}>
          <div><h3>Where does this trip start?</h3><p>Add the city or airport before the first stop.</p></div>
          <div className={styles.originControls}>
            <EasyTField label="Starting city or airport" value={originValue} onChange={(event) => onOriginValueChange(event.target.value)} error={originError} />
            <EasyTButton variant="secondary" onClick={onResolveOrigin} disabled={!originValue.trim()}>Check place</EasyTButton>
          </div>
          <ImportPlaceClarification key={`origin:${originValue}`} name={originValue || "starting point"} options={originOptions} role="endpoint" onSelect={onSelectOrigin} />
        </div> : null}

        {ambiguousMappings.length ? <div className={styles.attentionItem}>
          <div><h3>We need help with {plural(ambiguousMappings.length, "column")}</h3><p>Choose what this spreadsheet column means.</p></div>
          <div className={styles.mappingGrid}>{ambiguousMappings.map((mapping) => <MappingSelect key={`${mapping.index}-${mapping.header}`} mapping={mapping} onUpdate={onUpdateMapping} />)}</div>
        </div> : null}

        {!resolvingPlaces && unresolvedStops.map((stop) => {
          const options = placeOptions[stop.id] ?? [];
          return <div className={styles.attentionItem} key={stop.id}>
            <div><h3>Which {stop.name} do you mean?</h3><p>Morrovia needs a safe place match to build the route.</p></div>
            <ImportPlaceClarification key={`${stop.id}:${stop.name}:${stop.country}`} name={stop.name} country={stop.country} options={options} onSelect={candidate => onSelectPlace(stop.id, candidate)} />
          </div>;
        })}

        {attentionIssues.map((issue) => <div className={styles.attentionItem} key={issue.id}><div><h3>{issue.title}</h3><p>{issue.detail}</p></div></div>)}
      </section> : null}

      {saveError ? <MorroviaRecoveryFeedback title="The trip was not created" detail={saveError} safety="The reviewed import remains on this page. Retry after resolving the issue; Morrovia will not create a second trip silently." onRetry={onConfirm} /> : null}

      <footer className={styles.confirmFooter}>
        <p><strong>{canConfirm ? "Everything looks ready. You can edit everything after import." : "Resolve the items under Needs your attention before creating the trip."}</strong></p>
        <EasyTButton size="large" icon={Check} loading={saving} disabled={!canConfirm} onClick={onConfirm}>Create trip</EasyTButton>
      </footer>

      <details className={styles.importDetails}>
        <summary><span><strong>Import details</strong><small>{plural(mappedCount, "column")} matched automatically · {skippedSummary.title}</small></span><span className={styles.detailsAction}>{skippedIssueGroups.length ? "View skipped rows" : "View details"}<ChevronDown aria-hidden="true" /></span></summary>
        <div className={styles.importDetailsBody}>
          <section className={styles.importDetailSection} aria-labelledby="column-mapping-title"><div><h3 id="column-mapping-title">Column mapping</h3><p>{plural(mappedCount, "column")} ready · {plural(ambiguousMappings.length, "column")} needs your attention · {plural(mappings.length - mappedCount - ambiguousMappings.length, "column")} ignored</p></div><div className={styles.mappingGrid}>{mappings.map((mapping) => <MappingSelect key={`${mapping.index}-${mapping.header}`} mapping={mapping} onUpdate={onUpdateMapping} />)}</div></section>
          <section className={styles.importDetailSection} aria-labelledby="skipped-rows-title"><div><h3 id="skipped-rows-title">Skipped rows</h3><p>{skippedSummary.detail}</p></div>{skippedIssueGroups.length ? <ul className={styles.skippedRows}>{skippedIssueGroups.map((group) => <li key={group.key}><strong>{group.title}</strong><span>{group.detail}{group.rowNumber ? ` Row ${group.rowNumber}.` : ""}</span></li>)}</ul> : <p className={styles.emptyImportDetail}>No source rows were skipped.</p>}</section>
          <section className={styles.importDetailSection} aria-labelledby="source-rows-title"><div><h3 id="source-rows-title">Source rows</h3><p>{sourceRowCount} non-blank rows · {sourceColumnCount} columns</p></div><div className={styles.sourceRows}>{proposal.rows.map((row) => <article key={row.rowNumber} data-status={row.status}><span>{row.status === "detected" ? "Ready" : row.status === "needs-review" ? "Needs your attention" : "Not imported"}</span><strong>Row {row.rowNumber}</strong><p>{row.recognised.join(" · ") || row.detail}</p></article>)}</div></section>
        </div>
      </details>
    </section>
  </>;
}
