import type { CanonicalEasyTTrip, JourneyEndpointPlace } from "./trip.ts";

export type BuilderInputBinding =
  | { kind: "origin" }
  | { kind: "destination"; intentId: string }
  | { kind: "nights"; intentId: string; stopId: string }
  | { kind: "date"; field: "startDate" | "endDate" }
  | { kind: "type" };
type EditableSource = { bound: boolean; value: unknown };
export type BuilderInputField = {
  binding: BuilderInputBinding; raw: string; acceptedSource: EditableSource;
  basisKey: string; status: "editable" | "binding-conflict";
};
export type BuilderInputDraft = {
  version: 1; ownerId: string | null; tripId: string; inputRevision: number;
  basedOnFingerprint: string; fields: BuilderInputField[];
};
export type BuilderInputStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };
// Same bounded short-text/entry limits as the homepage codec; no truncation of protected bytes.
const TEXT_LIMIT = 256;
const FIELD_LIMIT = 12 * 2 + 4;
const BYTE_LIMIT = 65_536;
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= TEXT_LIMIT;
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;
function stable(value: unknown): string {
  const ordered = (item: unknown): unknown => Array.isArray(item) ? item.map(ordered)
    : record(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, ordered(entry)])) : item;
  return JSON.stringify(ordered(value));
}
function bindingKey(binding: BuilderInputBinding) { return stable(binding); }
function validBinding(value: unknown): value is BuilderInputBinding {
  if (!record(value)) return false;
  const keys = Object.keys(value).sort().join(",");
  switch (value.kind) {
    case "origin": case "type": return keys === "kind";
    case "destination": return keys === "intentId,kind" && text(value.intentId);
    case "nights": return keys === "intentId,kind,stopId" && text(value.intentId) && text(value.stopId);
    case "date": return keys === "field,kind" && ["startDate", "endDate"].includes(String(value.field));
    default: return false;
  }
}
function placeIdentity(place: JourneyEndpointPlace | null): unknown {
  if (!place) return null;
  if (place.canonicalPlaceId) return { canonicalPlaceId: place.canonicalPlaceId };
  if (place.providerId) return { providerId: place.providerId };
  return { name: place.name, country: place.country ?? null, coordinates: place.coordinates ?? null };
}
/** Only the accepted source needed to apply this field; excludes projection/CAS and unrelated edits. */
export function builderInputDraftBasis(trip: CanonicalEasyTTrip, binding: BuilderInputBinding): EditableSource {
  const route = trip.brief.intent.route;
  switch (binding.kind) {
    case "origin": return { bound: true, value: placeIdentity(route.origin) };
    case "type": return { bound: true, value: { tripType: route.tripType, end: route.journeyEnd.mode === "explicit"
      ? { mode: "explicit", place: placeIdentity(route.journeyEnd.place) } : route.journeyEnd, origin: placeIdentity(route.origin) } };
    case "date": return { bound: true, value: { startDate: trip.startDate, endDate: trip.endDate,
      constraints: trip.brief.intent.hardConstraints.fixedCommitments.map(item => ({ id: item.id, stopId: item.stopId, date: item.date ?? null })) } };
    case "destination": {
      const intent = route.destinations.find(item => item.id === binding.intentId);
      return { bound: Boolean(intent), value: intent ? { id: intent.id, kind: intent.kind, sourceText: intent.sourceText,
        place: placeIdentity(intent.selectedPlace), stopIds: intent.stopIds } : null };
    }
    case "nights": {
      const intent = route.destinations.find(item => item.id === binding.intentId);
      const stop = trip.stops.find(item => item.id === binding.stopId);
      const bound = Boolean(stop && intent?.stopIds.includes(binding.stopId));
      const manual = (trip.brief.manualNightStopIds ?? []).includes(binding.stopId);
      return { bound, value: bound ? { intentId: intent!.id, kind: intent!.kind, stopId: stop!.id,
        place: placeIdentity({ name: stop!.name, canonicalPlaceId: stop!.canonicalPlaceId, providerId: stop!.providerId,
          country: stop!.country, coordinates: Number.isFinite(stop!.longitude) && Number.isFinite(stop!.latitude) ? [stop!.longitude!, stop!.latitude!] : undefined }),
        requestedNights: intent!.requestedNights, manual,
        ...(manual ? { explicitStopNights: trip.brief.nightAllocations?.[stop!.id] ?? stop!.nights } : {}) } : null };
    }
  }
}
function fingerprint(fields: BuilderInputField[]) {
  return stable(fields.map(field => ({ binding: field.binding, basisKey: field.basisKey })).sort((a, b) => bindingKey(a.binding).localeCompare(bindingKey(b.binding))));
}
export function builderInputDraftKey(ownerId: string | null, tripId: string) {
  return `easyt-private:${ownerId === null ? "guest" : encodeURIComponent(ownerId)}:builder-input:${encodeURIComponent(tripId)}`;
}
export function createBuilderInputDraft(trip: CanonicalEasyTTrip, inputRevision = 0): BuilderInputDraft {
  if (!revision(inputRevision)) throw new TypeError("Invalid input revision");
  return { version: 1, ownerId: trip.ownerId, tripId: trip.id, inputRevision, basedOnFingerprint: fingerprint([]), fields: [] };
}
function sameScope(draft: BuilderInputDraft, trip: CanonicalEasyTTrip) { return draft.ownerId === trip.ownerId && draft.tripId === trip.id; }
export function updateBuilderInputDraft(draft: BuilderInputDraft, trip: CanonicalEasyTTrip, binding: BuilderInputBinding, raw: string): BuilderInputDraft {
  if (!sameScope(draft, trip) || !validBinding(binding) || typeof raw !== "string" || raw.length > TEXT_LIMIT
    || !revision(draft.inputRevision + 1)) throw new TypeError("Invalid or foreign input draft");
  const next = rebindBuilderInputDraft(draft, trip);
  const index = next.fields.findIndex(field => bindingKey(field.binding) === bindingKey(binding));
  if (index >= 0 && next.fields[index]!.raw === raw) return next;
  if (index < 0 && next.fields.length >= FIELD_LIMIT) throw new TypeError("Too many input fields");
  const source = builderInputDraftBasis(trip, binding);
  const previous = index < 0 ? undefined : next.fields[index];
  const acceptedSource = !source.bound && previous ? previous.acceptedSource : source;
  const field: BuilderInputField = { binding: structuredClone(binding), raw,
    acceptedSource: structuredClone(acceptedSource), basisKey: stable(acceptedSource), status: source.bound ? "editable" : "binding-conflict" };
  if (index < 0) next.fields.push(field); else next.fields[index] = field;
  next.inputRevision++;
  next.basedOnFingerprint = fingerprint(next.fields);
  return next;
}
export function rebindBuilderInputDraft(draft: BuilderInputDraft, trip: CanonicalEasyTTrip): BuilderInputDraft {
  if (!sameScope(draft, trip)) throw new TypeError("Foreign input draft");
  const next = structuredClone(draft);
  next.fields = next.fields.map(field => {
    const source = builderInputDraftBasis(trip, field.binding);
    const safe = source.bound && stable(source) === field.basisKey;
    return safe ? { ...field, acceptedSource: source, basisKey: stable(source), status: "editable" }
      : { ...field, status: "binding-conflict" };
  });
  next.basedOnFingerprint = fingerprint(next.fields);
  return next;
}
/** Accepted arms consume their own source only; a stale/blocked input remains available for review. */
export function consumeBuilderInputDraft(draft: BuilderInputDraft, binding: BuilderInputBinding, expectedInputRevision: number, expectedRaw: string): BuilderInputDraft {
  const field = draft.fields.find(item => bindingKey(item.binding) === bindingKey(binding));
  if (!field || draft.inputRevision !== expectedInputRevision || field.raw !== expectedRaw || field.status !== "editable") return structuredClone(draft);
  return discardBuilderInputDraftField(draft, binding, expectedInputRevision);
}
/** Explicit traveller discard is permitted for a blocked field too. */
export function discardBuilderInputDraftField(draft: BuilderInputDraft, binding: BuilderInputBinding, expectedInputRevision: number): BuilderInputDraft {
  if (draft.inputRevision !== expectedInputRevision || !revision(draft.inputRevision + 1)) return structuredClone(draft);
  const fields = draft.fields.filter(item => bindingKey(item.binding) !== bindingKey(binding));
  if (fields.length === draft.fields.length) return structuredClone(draft);
  return { ...structuredClone(draft), fields: structuredClone(fields), inputRevision: draft.inputRevision + 1, basedOnFingerprint: fingerprint(fields) };
}
function exactKeys(value: Record<string, unknown>, keys: string[]) { return Object.keys(value).sort().join(",") === [...keys].sort().join(","); }
function validEnvelope(value: unknown): value is BuilderInputDraft {
  if (!record(value) || !exactKeys(value, ["version", "ownerId", "tripId", "inputRevision", "basedOnFingerprint", "fields"])
    || value.version !== 1 || !(value.ownerId === null || text(value.ownerId)) || !text(value.tripId) || !revision(value.inputRevision)
    || typeof value.basedOnFingerprint !== "string" || !Array.isArray(value.fields) || value.fields.length > FIELD_LIMIT) return false;
  const seen = new Set<string>();
  for (const field of value.fields) {
    if (!record(field) || !exactKeys(field, ["binding", "raw", "acceptedSource", "basisKey", "status"])
      || !validBinding(field.binding) || typeof field.raw !== "string" || field.raw.length > TEXT_LIMIT
      || !record(field.acceptedSource) || !exactKeys(field.acceptedSource, ["bound", "value"]) || typeof field.acceptedSource.bound !== "boolean"
      || typeof field.basisKey !== "string" || stable(field.acceptedSource) !== field.basisKey
      || !["editable", "binding-conflict"].includes(String(field.status))) return false;
    const key = bindingKey(field.binding);
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return fingerprint(value.fields as BuilderInputField[]) === value.basedOnFingerprint;
}
export type BuilderInputReadResult = { kind: "empty" } | { kind: "readable"; draft: BuilderInputDraft }
  | { kind: "protected"; raw: string } | { kind: "error"; reason: "storage" };
export function readBuilderInputDraft(storage: Pick<BuilderInputStorage, "getItem">, trip: CanonicalEasyTTrip): BuilderInputReadResult {
  let raw: string | null;
  try { raw = storage.getItem(builderInputDraftKey(trip.ownerId, trip.id)); } catch { return { kind: "error", reason: "storage" }; }
  if (raw === null) return { kind: "empty" };
  try {
    const value: unknown = raw.length <= BYTE_LIMIT ? JSON.parse(raw) : null;
    if (!validEnvelope(value) || !sameScope(value, trip)) return { kind: "protected", raw };
    return { kind: "readable", draft: rebindBuilderInputDraft(value, trip) };
  } catch { return { kind: "protected", raw }; }
}
export function writeBuilderInputDraft(storage: BuilderInputStorage, trip: CanonicalEasyTTrip, draft: BuilderInputDraft):
  { ok: true } | { ok: false; reason: "protected" | "storage" | "stale" | "invalid" } {
  try {
    if (!validEnvelope(draft) || !sameScope(draft, trip)) return { ok: false, reason: "invalid" };
    const prior = readBuilderInputDraft(storage, trip);
    if (prior.kind === "protected") return { ok: false, reason: "protected" };
    if (prior.kind === "error") return { ok: false, reason: "storage" };
    if (prior.kind === "readable") {
      const rawFields = (value: BuilderInputDraft) => stable(value.fields.map(field => ({ binding: field.binding, raw: field.raw })));
      if (prior.draft.inputRevision > draft.inputRevision || prior.draft.inputRevision === draft.inputRevision && rawFields(prior.draft) !== rawFields(draft)) return { ok: false, reason: "stale" };
    }
    const next = rebindBuilderInputDraft(draft, trip);
    const serialized = JSON.stringify(next);
    if (serialized.length > BYTE_LIMIT) return { ok: false, reason: "invalid" };
    storage.setItem(builderInputDraftKey(trip.ownerId, trip.id), serialized);
    return { ok: true };
  } catch { return { ok: false, reason: "storage" }; }
}
