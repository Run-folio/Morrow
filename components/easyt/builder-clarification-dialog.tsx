"use client";

import { ArrowLeft, Check, ChevronRight, Plus, X } from "lucide-react";
import { forwardRef, useEffect, useId, useRef, useState } from "react";
import type { CanonicalPlaceSuggestion, NearbyBaseAnchor, PlaceType, PlanningParentConstraint } from "@/lib/easyt/place-intelligence";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { EasyTButton } from "./easyt-controls";
import styles from "./builder-clarification-dialog.module.css";

export type BuilderClarificationSelectedPlace = {
  id: string;
  name: string;
  detail?: string;
};

export type BuilderClarificationSuggestion = {
  id: string;
  name: string;
  detail: string;
};

export type BuilderClarificationChoice = {
  id: string;
  label: string;
  detail?: string;
};

export type BuilderClarificationRouteShape = {
  id: string;
  title: string;
  summary: string;
  reason: string;
  places: Array<{ id: string; name: string; detail: string }>;
};

export type BuilderClarificationSearch = {
  label: string;
  placeholder: string;
  value: string;
  contextCountries?: string[];
  parentConstraint?: PlanningParentConstraint;
  nearbyAnchor?: NearbyBaseAnchor;
  allowedPlaceTypes?: PlaceType[];
  error?: string;
  emptyMessage?: string;
  failureMessage?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: CanonicalPlaceSuggestion) => void;
};

export const BuilderClarificationResume = forwardRef<HTMLButtonElement, {
  label: string;
  itemNames: string[];
  actionLabel: string;
  ariaLabel: string;
  onContinue: () => void;
}>(function BuilderClarificationResume({ label, itemNames, actionLabel, ariaLabel, onContinue }, ref) {
  return <section className={styles.resume} aria-label={ariaLabel}>
    <div><strong>{label}</strong><span>{itemNames.join(" · ")}</span></div>
    <EasyTButton ref={ref} variant="secondary" onClick={onContinue}>{actionLabel}</EasyTButton>
  </section>;
});

export function BuilderClarificationDialog({
  open,
  language = "en",
  itemKey,
  progress,
  title,
  description,
  question,
  selectedPlaces = [],
  suggestions = [],
  suggestionsLabel,
  suggestionsActionLabel,
  suggestionsStatus,
  choices = [],
  routeShapes = [],
  search,
  doneLabel,
  doneDisabled = false,
  doneDisabledReason,
  applyingShapeId,
  backLabel = "Back",
  finishLaterLabel = "Finish later",
  removeLabel,
  onDismiss,
  onBack,
  onDone,
  onRemoveItem,
  onRemoveSelected,
  onAddSuggestion,
  onSuggestionsAction,
  onChoose,
  onApplyShape,
}: {
  open: boolean;
  language?: "en" | "es";
  itemKey: string;
  progress: string;
  title: string;
  description: string;
  question?: string;
  selectedPlaces?: BuilderClarificationSelectedPlace[];
  suggestions?: BuilderClarificationSuggestion[];
  suggestionsLabel?: string;
  suggestionsActionLabel?: string;
  suggestionsStatus?: string;
  choices?: BuilderClarificationChoice[];
  routeShapes?: BuilderClarificationRouteShape[];
  search?: BuilderClarificationSearch;
  doneLabel?: string;
  doneDisabled?: boolean;
  doneDisabledReason?: string;
  applyingShapeId?: string | null;
  backLabel?: string;
  finishLaterLabel?: string;
  removeLabel?: string;
  onDismiss: () => void;
  onBack?: () => void;
  onDone?: () => void;
  onRemoveItem?: () => void;
  onRemoveSelected?: (place: BuilderClarificationSelectedPlace) => void;
  onAddSuggestion?: (suggestion: BuilderClarificationSuggestion) => void;
  onSuggestionsAction?: () => void;
  onChoose?: (choice: BuilderClarificationChoice) => void;
  onApplyShape?: (shape: BuilderClarificationRouteShape) => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const disabledReasonId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const dismissRef = useRef(onDismiss);
  const [reviewingShapeId, setReviewingShapeId] = useState<string | null>(null);
  const text = language === "es" ? {
    close: "Cerrar la selección de lugares",
    choices: "Opciones de lugar",
    selected: "LUGARES ELEGIDOS",
    ways: "FORMAS DE DAR FORMA AL VIAJE",
    review: "Revisa estos lugares antes de añadirlos. Nada cambia hasta que confirmes.",
    addShape: "Añadir estos lugares",
    suggested: "LUGARES SUGERIDOS",
    remove: "Quitar",
  } : {
    close: "Close route shaping",
    choices: "Place choices",
    selected: "SELECTED PLACES",
    ways: "WAYS YOU COULD SHAPE THIS",
    review: "Review these places before adding them. Nothing changes until you confirm.",
    addShape: "Add these places",
    suggested: "SUGGESTED PLACES",
    remove: "Remove",
  };
  dismissRef.current = onDismiss;

  useEffect(() => {
    if (!open) return;
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...(dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ) ?? [])];
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismissRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      returnFocus?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setReviewingShapeId(null);
    window.requestAnimationFrame(() => titleRef.current?.focus());
  }, [itemKey, open]);

  if (!open) return null;

  return <div
    className={styles.overlay}
    role="presentation"
    onMouseDown={(event) => { if (event.target === event.currentTarget) onDismiss(); }}
  >
    <section
      ref={dialogRef}
      className={styles.dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      data-builder-clarification-ui="true"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <header className={styles.header}>
        <p aria-live="polite">{progress}</p>
        <EasyTButton icon={X} iconOnly variant="quiet" size="small" onClick={onDismiss}>{text.close}</EasyTButton>
        <h2 ref={titleRef} id={titleId} tabIndex={-1}>{title}</h2>
        <span id={descriptionId}>{description}</span>
      </header>

      <div className={styles.body}>
        {question ? <p className={styles.question}>{question}</p> : null}
        {choices.length ? <section className={styles.choices} aria-label={text.choices}>
          {choices.map((choice) => <EasyTButton key={choice.id} variant="secondary" onClick={() => onChoose?.(choice)}>
            <span><b>{choice.label}</b>{choice.detail ? <small>{choice.detail}</small> : null}</span><ChevronRight aria-hidden="true" />
          </EasyTButton>)}
        </section> : null}

        {selectedPlaces.length ? <section className={styles.selected} aria-live="polite">
          <strong>{text.selected}</strong>
          <div>{selectedPlaces.map((place) => <span key={place.id}>
            <span><b>{place.name}</b>{place.detail ? <small>{place.detail}</small> : null}</span>
            <EasyTButton icon={X} iconOnly variant="quiet" size="small" onClick={() => onRemoveSelected?.(place)}>{text.remove} {place.name}</EasyTButton>
          </span>)}</div>
        </section> : null}

        {routeShapes.length ? <section className={styles.shapes} aria-label={text.ways}>
          <strong>{text.ways}</strong>
          <div>{routeShapes.map((shape) => {
            const reviewing = reviewingShapeId === shape.id;
            return <article key={shape.id}>
              {/* morrovia-ui-audit-allow-next-line native-control -- Route-shape disclosure owns aria-expanded and an embedded review region, which is not a push-button action. */}
              <button type="button" aria-expanded={reviewing} onClick={() => setReviewingShapeId(reviewing ? null : shape.id)}>
                <span><b>{shape.title}</b><small>{shape.summary}</small><em>{shape.reason}</em></span><ChevronRight aria-hidden="true" />
              </button>
              {reviewing ? <div className={styles.shapeReview}>
                <p>{text.review}</p>
                <ul>{shape.places.map((place) => <li key={place.id}><b>{place.name}</b><span>{place.detail}</span></li>)}</ul>
                <EasyTButton size="small" loading={applyingShapeId === shape.id} onClick={() => onApplyShape?.(shape)}>{text.addShape}</EasyTButton>
              </div> : null}
            </article>;
          })}</div>
        </section> : null}

        {suggestions.length || suggestionsStatus ? <section className={styles.suggestions} aria-label={suggestionsLabel ?? text.suggested}>
          <strong>{suggestionsLabel ?? text.suggested}</strong>
          {suggestions.length ? <div>{suggestions.map((suggestion) => <div key={suggestion.id}>
            {/* morrovia-ui-audit-allow-next-line native-control -- A suggestion option has two-line place metadata and a list-selection contract distinct from the shared action button. */}
            <button type="button" onClick={() => onAddSuggestion?.(suggestion)}>
            <Plus aria-hidden="true" /><span><b>{suggestion.name}</b><small>{suggestion.detail}</small></span>
            </button>
          </div>)}</div> : null}
          {suggestionsStatus ? <p className={styles.suggestionStatus} role="status">{suggestionsStatus}</p> : null}
          {suggestionsActionLabel && onSuggestionsAction ? <EasyTButton className={styles.suggestionsMore} variant="quiet" size="small" onClick={onSuggestionsAction}>{suggestionsActionLabel}</EasyTButton> : null}
        </section> : null}

        {search ? <section className={styles.search}>
          <strong>{search.label}</strong>
          <CanonicalPlaceAutocomplete
            label={search.label}
            value={search.value}
            placeholder={search.placeholder}
            contextCountries={search.contextCountries}
            parentConstraint={search.parentConstraint}
            nearbyAnchor={search.nearbyAnchor}
            allowedPlaceTypes={search.allowedPlaceTypes}
            showPlaceType={false}
            invalid={Boolean(search.error)}
            describedBy={search.error ? `${descriptionId}-search-error` : undefined}
            emptyMessage={search.emptyMessage}
            failureMessage={search.failureMessage}
            onChange={search.onChange}
            onSelect={search.onSelect}
          />
          {search.error ? <p id={`${descriptionId}-search-error`} role="alert">{search.error}</p> : null}
        </section> : null}

        {doneLabel && onDone && doneDisabled && doneDisabledReason ? <p id={disabledReasonId} className={styles.disabledReason}>{doneDisabledReason}</p> : null}
      </div>

      <footer className={styles.footer}>
        <div>{onBack ? <EasyTButton icon={ArrowLeft} variant="quiet" onClick={onBack}>{backLabel}</EasyTButton> : null}
          <EasyTButton variant="quiet" onClick={onDismiss}>{finishLaterLabel}</EasyTButton></div>
        {doneLabel && onDone ? <EasyTButton icon={Check} disabled={doneDisabled} aria-describedby={doneDisabled && doneDisabledReason ? disabledReasonId : undefined} onClick={onDone}>{doneLabel}</EasyTButton> : null}
      </footer>
      {removeLabel && onRemoveItem ? <EasyTButton className={styles.remove} variant="quiet" size="small" onClick={onRemoveItem}>{removeLabel}</EasyTButton> : null}
    </section>
  </div>;
}
