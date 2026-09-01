import type { JourneyCaptureResult } from "./journey-capture.ts";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "./place-intelligence.ts";
import type { EasyTLanguage } from "./i18n.ts";

type JourneyCaptureFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type JourneyCaptureValidationIssue = {
  code: "missing_trip_intent";
  field: "prompt";
};

/** Capture submission has one shared intent requirement. Homepage supplies no
 * alternative, while Builder may satisfy it with its canonical manual
 * origin/stops structure. Supplementary dates and preferences are deliberately
 * irrelevant to this decision. */
export function validateJourneyCaptureSubmission(input: {
  prompt: string;
  allowEmptyPrompt?: boolean;
}): JourneyCaptureValidationIssue | null {
  if (input.prompt.trim() || input.allowEmptyPrompt) return null;
  return { code: "missing_trip_intent", field: "prompt" };
}

export function journeyCaptureValidationMessage(
  issue: JourneyCaptureValidationIssue,
  language: EasyTLanguage,
) {
  if (issue.code === "missing_trip_intent") return language === "es"
    ? "Cuéntanos adónde te gustaría ir o qué tipo de viaje estás planeando."
    : "Tell us where you'd like to go or what kind of trip you're planning.";
  return "";
}

export function journeyCaptureFailureMessage(
  failure: "interpretation" | "network",
  language: EasyTLanguage,
) {
  if (failure === "network") return language === "es"
    ? "No pudimos comprobar esos lugares ahora mismo. Inténtalo de nuevo."
    : "We couldn't check those places right now. Try again.";
  return language === "es"
    ? "Todavía no pudimos identificar un lugar en ese viaje. Añade una ciudad, país o región."
    : "We couldn't identify a place in that trip yet. Try adding a city, country or region.";
}

/** Compose optional Builder controls into the same natural-language capture
 * request used by the main prompt. This is deliberately an input adapter, not
 * a second trip model: interpretation, deduplication and review remain owned
 * by the canonical journey-capture pipeline. */
export function composeJourneyCaptureBrief(input: {
  prompt?: string;
  origin?: string;
  destinations?: string[];
}) {
  const prompt = input.prompt?.trim() ?? "";
  const origin = input.origin?.trim() ?? "";
  const destinations = (input.destinations ?? []).map((destination) => destination.trim()).filter(Boolean);
  const manualLines = [
    origin ? `Starting from ${origin}.` : "",
    destinations.length === 1
      ? `I want to visit ${destinations[0]}.`
      : destinations.length > 1
        ? `I want to visit ${destinations.join(", then ")}, in that order.`
        : "",
  ].filter(Boolean);
  return [prompt, ...manualLines].filter(Boolean).join("\n");
}

/** Preserve an explicit canonical departure choice after the shared text
 * capture has interpreted the complete brief. The capture pipeline still owns
 * every other fact; this only prevents a chosen city/gateway from being
 * broadened or re-ambiguated by its textual representation. */
export function applySelectedOriginToJourneyCapture(
  capture: JourneyCaptureResult,
  selectedOrigin?: CanonicalPlaceSuggestion,
): JourneyCaptureResult {
  if (!selectedOrigin) return capture;
  const capturedOrigin = capture.mentions.find((mention) => mention.role === "origin");
  if (!capturedOrigin) return capture;
  const selectedMention: ResolvedPlaceMention = {
    ...capturedOrigin,
    canonicalName: selectedOrigin.name,
    canonicalPlaceId: selectedOrigin.canonicalPlaceId,
    aliases: Array.from(new Set([...capturedOrigin.aliases, selectedOrigin.name, selectedOrigin.label])),
    placeType: selectedOrigin.placeType,
    status: "resolved",
    provenance: selectedOrigin.provenance.length ? selectedOrigin.provenance : capturedOrigin.provenance,
    parentCountries: selectedOrigin.country ? [selectedOrigin.country] : [],
    parentRegionId: selectedOrigin.region,
    coordinates: selectedOrigin.coordinates,
    routability: "direct_destination",
    directlyRoutable: true,
    requiresBaseSelection: false,
    isAnchor: false,
    candidates: [],
  };
  const replaceOrigin = (mention: ResolvedPlaceMention) => mention.mentionId === capturedOrigin.mentionId ? selectedMention : mention;
  const withoutOriginIssue = <T extends { mentionId: string }>(issue: T) => issue.mentionId !== capturedOrigin.mentionId;
  return {
    ...capture,
    mentions: capture.mentions.map(replaceOrigin),
    structuredBrief: {
      ...capture.structuredBrief,
      destinations: capture.structuredBrief.destinations.map((destination) => destination.placeMentionId === capturedOrigin.mentionId ? {
        ...destination,
        name: selectedOrigin.name,
        canonicalPlaceId: selectedOrigin.canonicalPlaceId,
        placeType: selectedOrigin.placeType,
        resolutionStatus: "resolved",
        routability: "direct_destination",
        parentCountries: selectedOrigin.country ? [selectedOrigin.country] : [],
      } : destination),
      placeMentions: (capture.structuredBrief.placeMentions ?? capture.mentions).map(replaceOrigin),
      placeIssues: (capture.structuredBrief.placeIssues ?? []).filter(withoutOriginIssue),
    },
  };
}

export async function requestJourneyCapture(
  brief: string,
  options: { fetcher?: JourneyCaptureFetch; onResponse?: () => void; signal?: AbortSignal } = {},
): Promise<JourneyCaptureResult> {
  const response = await (options.fetcher ?? fetch)("/api/journey-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ brief }),
    signal: options.signal,
  });
  options.onResponse?.();
  const payload = await response.json() as JourneyCaptureResult & { message?: string };
  if (!response.ok) throw new Error(payload.message || "Capture failed");
  return payload;
}

export type LatestJourneyCaptureRequest = {
  signal: AbortSignal;
  isCurrent: () => boolean;
  finish: () => void;
};

/**
 * Coordinates capture submissions without owning interpretation. A provider or
 * browser that ignores abort still cannot let an older result replace a newer
 * complete capture.
 */
export function createLatestJourneyCaptureRequestGate() {
  let generation = 0;
  let controller: AbortController | null = null;

  return {
    begin(): LatestJourneyCaptureRequest {
      generation += 1;
      controller?.abort();
      const requestGeneration = generation;
      const requestController = new AbortController();
      controller = requestController;
      return {
        signal: requestController.signal,
        isCurrent: () => generation === requestGeneration && !requestController.signal.aborted,
        finish: () => {
          if (generation === requestGeneration && controller === requestController) controller = null;
        },
      };
    },
    cancel() {
      generation += 1;
      controller?.abort();
      controller = null;
    },
  };
}
