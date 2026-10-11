import { selectedTransportChoiceForLeg, effectiveTripLeg } from "./transport-mode-choice.ts";
import { geographicDependency, stopGeographicPlace, guardTripRoutingGeometry } from './geographic-binding.ts';
import { assessRouteIntelligence, routeIntelligenceForPersistence } from "./planner.ts";
import { plannerEndpointForJourneyEnd, originPlaceFromBrief } from "./journey-endpoints.ts";
import type { CanonicalEasyTTrip, RouteReconciliationScope, TripLeg, TripRouteReconciliation } from './trip.ts';
import { prepareTripDocumentForWrite, TripDocumentReadError } from './trip-document.ts';
import { buildCanonicalTripLegs, routeEndpointForLeg } from './trip-legs.ts';
import { routeProjectionInputKey, commitAcceptedRouteProjection } from './trip-route-intent.ts';
import { projectBuilderCalendar } from './trip-builder-calendar.ts';
import { reconcileAuthoredDayState } from './trip-authored-day-state.ts';
import type { BuilderRecommendationProjection } from './trip-builder-recommendations.ts';
import { authoredContentKey, retainedSnapshotIsLive, restoreRetiredDayBindings, retainRemovedAuthoredContent, restoreRetainedAuthoredContent, prepareRetainedContentPreservationSource, type RetainedContentConsumption } from './trip-retained-authored-content.ts';
export type BuilderEditScope = {
    ownerId: string | null;
    tripId: string;
    inputRevision: number;
};
type Unit = TripRouteReconciliation['residual'][number];
type Result = Omit<Unit, 'phase'> & {
    phase: 'complete' | 'failed' | 'conflict';
};
export type BuilderProjectionResponse = {
    scope: BuilderEditScope;
    inputKey: string;
    requestId: string;
    dispatched: Unit[];
    results: Result[];
    legs: TripLeg[];
    recommendationProjections?: BuilderRecommendationProjection[];
    routeAssessment?: CanonicalEasyTTrip["brief"]["routeAssessment"];
};
const unitId = (u: Pick<Unit, 'kind' | 'targetId'>) => `${u.kind}:${u.targetId}`;
const pair = (leg: TripLeg) => authoredContentKey([leg.fromStopId, leg.toStopId]);
const place = (value: ReturnType<typeof routeEndpointForLeg>) => value ? { id: value.id, canonicalPlaceId: value.canonicalPlaceId, providerId: value.providerId, coordinates: value.coordinates, ...geographicDependency({...value,coordinates:value.coordinates??undefined},value.kind==='stop'?'stop':'endpoint'), ...(!value.canonicalPlaceId && !value.providerId ? { name: value.name, country: value.country } : {}) } : null;
/** A saved candidate is authoritative only while its full endpoint evidence still matches. */
function selectedChoiceHasCurrentEvidence(trip: CanonicalEasyTTrip, leg: TripLeg): boolean {
    const selected = selectedTransportChoiceForLeg(trip, leg);
    return Boolean(selected && authoredContentKey([place(selected.segments[0].fromEndpoint), place(selected.segments.at(-1)!.toEndpoint)])
        === authoredContentKey([place(routeEndpointForLeg(trip, leg, "from")), place(routeEndpointForLeg(trip, leg, "to"))]));
}
function withAcceptedTransportChoice(trip: CanonicalEasyTTrip, current: TripLeg, replacement: TripLeg): TripLeg {
    if (!selectedChoiceHasCurrentEvidence(trip, current))
        return replacement;
    const retained = { ...replacement, routeMetadata: { ...replacement.routeMetadata, multimodalResolution: structuredClone(current.routeMetadata.multimodalResolution) } };
    return effectiveTripLeg(trip, retained);
}
function basis(trip: CanonicalEasyTTrip, kind: Unit['kind'], targetId: string): string | null {
    const route = trip.brief.intent.route;
    const schedule = { start: trip.startDate, end: trip.endDate, stops: trip.stops.map(s => ({ id: s.id, nights: s.nights })), locks: trip.brief.scheduleLocks, commitments: trip.brief.intent.hardConstraints.fixedCommitments, bookings: trip.brief.bookings?.map(b => ({ id: b.id, type: b.type, date: b.date, endDate: b.endDate })) };
    if (kind === 'leg') {
        const leg = trip.legs.find(l => l.id === targetId);
        if (!leg)
            return null;
        return authoredContentKey({ from: place(routeEndpointForLeg(trip, leg, 'from')), to: place(routeEndpointForLeg(trip, leg, 'to')), modes: trip.brief.intent.preferences.transportModes, avoidDriving: trip.brief.intent.hardConstraints.avoidDriving, choice: trip.brief.decisionSelections?.transportByLeg[leg.id] ?? null, dates: [trip.startDate, trip.endDate], timing: trip.stops.filter(s => [leg.fromStopId, leg.toStopId].includes(s.id)).map(s => ({ id: s.id, arrival: s.arrivalDate, departure: s.id === leg.fromStopId ? s.departureDate : undefined })) });
    }
    if (kind === 'schedule')
        return trip.stops.some(s => s.id === targetId) ? authoredContentKey(schedule) : null;
    if (kind === 'recommendation') {
        const stop = trip.stops.find(s => s.id === targetId);
        return stop ? authoredContentKey({ stop: { id: stop.id, canonicalPlaceId: stop.canonicalPlaceId, coordinates: [stop.longitude, stop.latitude], nights: stop.nights, ...geographicDependency(stopGeographicPlace(stop)) }, preferences: trip.brief.intent.preferences, travellers: trip.travellers, budget: trip.brief.budgetBand }) : null;
    }
    if (targetId !== trip.id)
        return null;
    if (kind === 'endpoint')
        return authoredContentKey({ origin: place({ kind: 'origin', id: `${trip.id}-origin`, ...route.origin, name: route.origin?.name ?? '', coordinates: route.origin?.coordinates ?? null }), end: route.journeyEnd, type: route.tripType });
    return authoredContentKey({ route: routeProjectionInputKey(trip), schedule });
}
const sorted = (units: Unit[]) => units.sort((a, b) => unitId(a).localeCompare(unitId(b)));
/** Identity-only canonicalization preserves work; it never validates stale source work or completes it. */
export function remapBuilderReconciliationIdentity(before: CanonicalEasyTTrip, after: CanonicalEasyTTrip,
    stopIds: ReadonlyMap<string, string>, legIds: ReadonlyMap<string, string>): CanonicalEasyTTrip {
    const marker = before.brief.cascadeStatus?.routeReconciliation;
    if (!marker) return after;
    if (marker.inputKey !== routeProjectionInputKey(before)) throw new TripDocumentReadError('invalid_trip_document');
    const residual = marker.residual.map(unit => {
        if (basis(before, unit.kind, unit.targetId) !== unit.basisKey) throw new TripDocumentReadError('invalid_trip_document');
        const targetId = unit.kind === 'schedule' || unit.kind === 'recommendation' ? stopIds.get(unit.targetId)
            : unit.kind === 'leg' ? legIds.get(unit.targetId)
            : unit.targetId === before.id ? after.id : undefined;
        const nextBasis = targetId === undefined ? null : basis(after, unit.kind, targetId);
        if (!nextBasis) throw new TripDocumentReadError('invalid_trip_document');
        return { ...unit, targetId: targetId!, basisKey: nextBasis };
    });
    return { ...after, brief: { ...after.brief, cascadeStatus: { ...after.brief.cascadeStatus!,
        routeReconciliation: { version: 1, inputKey: routeProjectionInputKey(after), residual } } } };
}
export function pendingBuilderReconciliationUnits(trip: CanonicalEasyTTrip): Unit[] {
    return structuredClone(trip.brief.cascadeStatus?.routeReconciliation?.residual.filter(u => u.phase === 'pending') ?? []);
}
function install(trip: CanonicalEasyTTrip, residual: Unit[]): CanonicalEasyTTrip {
    const { routeReconciliation: _prior, ...status } = trip.brief.cascadeStatus ?? { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0 };
    return { ...trip, brief: { ...trip.brief, cascadeStatus: { ...status, ...(residual.length ? { routeReconciliation: { version: 1 as const, inputKey: routeProjectionInputKey(trip), residual: sorted(residual) } } : {}) } } };
}
/** Rebase only dependent-work metadata; JSONB key order is not work identity. */
export function mergeBuilderReconciliationDocuments(base: CanonicalEasyTTrip, authored: CanonicalEasyTTrip,
    canonical: CanonicalEasyTTrip, merged: CanonicalEasyTTrip): CanonicalEasyTTrip {
    const bySubject = (trip: CanonicalEasyTTrip) => new Map((trip.brief.cascadeStatus?.routeReconciliation?.residual ?? []).map(unit => [unitId(unit), unit]));
    const prior = bySubject(base), local = bySubject(authored), acknowledged = bySubject(canonical);
    const subjects = new Set([...prior.keys(), ...local.keys(), ...acknowledged.keys()]);
    const residual: Unit[] = [];
    const equal = (left: Unit | undefined, right: Unit | undefined) => authoredContentKey(left ?? null) === authoredContentKey(right ?? null);
    for (const subject of subjects) {
        const old = prior.get(subject), a = local.get(subject), c = acknowledged.get(subject);
        const example = (a ?? c ?? old)!;
        const currentBasis = basis(merged, example.kind, example.targetId);
        if (!currentBasis) continue; // Removed targets have no dependent work.
        const localChanged = !equal(a, old), canonicalChanged = !equal(c, old);
        // Absence is completion only on a side with the current dependency inputs.
        if (!a && old && localChanged && basis(authored, example.kind, example.targetId) === currentBasis) continue;
        if (!c && old && canonicalChanged && !localChanged && basis(canonical, example.kind, example.targetId) === currentBasis) continue;
        const localCurrent = a?.basisKey === currentBasis ? a : undefined;
        const canonicalCurrent = c?.basisKey === currentBasis ? c : undefined;
        let selected = localCurrent ?? canonicalCurrent;
        if (localCurrent && canonicalCurrent) {
            selected = !localChanged ? canonicalCurrent : !canonicalChanged ? localCurrent
                : localCurrent.phase === 'pending' && canonicalCurrent.phase !== 'pending' ? canonicalCurrent : localCurrent;
        }
        // Combined disjoint inputs can invalidate both sides' provider evidence.
        residual.push(selected ? structuredClone(selected) : { kind: example.kind, targetId: example.targetId, basisKey: currentBasis, phase: 'pending' });
    }
    // An ordinary queued edit with no dependent work must not gain metadata
    // absent from its already-stored recovery document. Keep explicit status
    // and all reconciliation work on the existing installation path.
    if (subjects.size === 0 && merged.brief.cascadeStatus === undefined) return merged;
    return install(merged, residual);
}
/** This synchronous prefix makes an accepted input safe to save before provider work. */
export function prepareBuilderNecessaryProjection(before: CanonicalEasyTTrip, candidate: CanonicalEasyTTrip, scope: RouteReconciliationScope, consumption?: RetainedContentConsumption): {
    ok: true;
    trip: CanonicalEasyTTrip;
} | {
    ok: false;
    reason: 'invalid-bindings';
} {
    try {
        if (before.id !== candidate.id || before.ownerId !== candidate.ownerId)
            return { ok: false, reason: 'invalid-bindings' };
        const validatedCandidate = prepareTripDocumentForWrite(candidate);
        if (consumption)
            before = prepareRetainedContentPreservationSource(before, validatedCandidate, consumption) as CanonicalEasyTTrip;
        let trip = retainRemovedAuthoredContent(before, validatedCandidate) as CanonicalEasyTTrip;
        const oldPairs = new Map(before.legs.map(l => [pair(l), l]));
        const graph = buildCanonicalTripLegs({ tripId: trip.id, origin: { ...(trip.brief.intent.route.origin ?? { name: '' }), coordinates: trip.brief.intent.route.origin?.coordinates ?? null }, journeyEnd: trip.brief.intent.route.journeyEnd, stops: trip.stops });
        const changed = new Set<string>();
        trip.legs = scope.legIds.length || scope.endpointChanged ? graph.map(leg => {
            const old = oldPairs.get(pair(leg));
            const id = old?.id ?? `${trip.id}-leg:${encodeURIComponent(leg.fromStopId)}:${encodeURIComponent(leg.toStopId)}`;
            const same = old && authoredContentKey([place(routeEndpointForLeg(before, old, 'from')), place(routeEndpointForLeg(before, old, 'to'))]) === authoredContentKey([place(leg.fromEndpoint ?? null), place(leg.toEndpoint ?? null)]);
            const affected = !same || scope.legIds.includes(old?.id ?? leg.id) || scope.legIds.includes(leg.id);
            if (!affected && old)
                return structuredClone(old);
            changed.add(id);
            const pending: TripLeg = { ...leg, id, mode: 'unknown', durationMinutes: null, headlineMinutes: null, doorToDoorMinutes: null, usableDayLoss: null, routedDistanceKm: null, provider: 'Travel options need an updated assessment.', provenance: 'unknown', confidence: 'unknown', routeMetadata: { source: 'necessary-reconciliation', pending: true }, warnings: [], scheduleNeedsChecking: true };
            return old ? withAcceptedTransportChoice(trip, old, pending) : pending;
        }) : structuredClone(before.legs);
        const restoredEntries = before.brief.retainedAuthoredContent?.entries.filter(entry => entry.sourceKind !== 'retired_day' && !trip.brief.retainedAuthoredContent?.entries.some(item => item.id === entry.id)) ?? [];
        const restoredRetiredEntries = before.brief.retainedAuthoredContent?.entries.filter(entry => entry.sourceKind === 'retired_day'
            && !validatedCandidate.brief.retainedAuthoredContent?.entries.some(item => item.id === entry.id)
            && retainedSnapshotIsLive(validatedCandidate, entry)) ?? [];
        const active = new Set(trip.stops.map(s => s.id));
        trip.planItems = trip.planItems.filter(d => active.has(d.stopId));
        if (scope.scheduleStopIds.length) {
            trip = reconcileAuthoredDayState(before, projectBuilderCalendar(before, trip).trip) as CanonicalEasyTTrip;
        }
        else {
            trip = reconcileAuthoredDayState(before, trip) as CanonicalEasyTTrip;
        }
        if (restoredRetiredEntries.length) trip = restoreRetiredDayBindings(trip, restoredRetiredEntries, validatedCandidate) as CanonicalEasyTTrip;
        if (restoredEntries.length) {
            const entries = [...(trip.brief.retainedAuthoredContent?.entries ?? []).filter(entry => !restoredEntries.some(item => item.id === entry.id)), ...restoredEntries];
            trip = restoreRetainedAuthoredContent({ ...trip, brief: { ...trip.brief, retainedAuthoredContent: { version: 1, entries } } }, restoredEntries.map(entry => entry.sourceStop)) as CanonicalEasyTTrip;
        }
        const arrivalDates = Object.fromEntries(Object.entries(trip.brief.scheduleLocks?.arrivalDates ?? {}).filter(([id]) => active.has(id)));
        if (trip.brief.scheduleLocks)
            trip.brief.scheduleLocks = { stopIds: trip.brief.scheduleLocks.stopIds.filter(id => active.has(id)), arrivalDates };
        const merged = new Map<string, Unit>();
        for (const unit of before.brief.cascadeStatus?.routeReconciliation?.residual ?? []) {
            const key = basis(trip, unit.kind, unit.targetId);
            if (key)
                merged.set(unitId(unit), key === unit.basisKey ? structuredClone(unit) : { kind: unit.kind, targetId: unit.targetId, basisKey: key, phase: 'pending' });
        }
        const add = (kind: Unit['kind'], id: string) => {
            const key = basis(trip, kind, id);
            if (key && !merged.has(`${kind}:${id}`))
                merged.set(`${kind}:${id}`, { kind, targetId: id, basisKey: key, phase: 'pending' });
        };
        changed.forEach(id => add('leg', id));
        scope.scheduleStopIds.forEach(id => add('schedule', id));
        scope.recommendationStopIds.forEach(id => add('recommendation', id));
        if (scope.endpointChanged)
            add('endpoint', trip.id);
        if (scope.routeAssessment) {
            trip.brief.routeAssessment = undefined;
            add('assessment', trip.id);
        }
        trip = install(trip, [...merged.values()]);
        return { ok: true, trip: prepareTripDocumentForWrite(trip) };
    }
    catch {
        return { ok: false, reason: 'invalid-bindings' };
    }
}
function finish(trip: CanonicalEasyTTrip, residual: Unit[]): CanonicalEasyTTrip {
    const hadBlockingWork = trip.brief.cascadeStatus?.routeReconciliation?.residual.some(unit => unit.kind !== "recommendation");
    trip = install(trip, residual);
    if (residual.some(u => u.kind !== 'recommendation'))
        return trip;
    if (!hadBlockingWork && trip.brief.intent.route.projectionInputKey === routeProjectionInputKey(trip))
        return trip;
    // Same-order necessary reconciliation always passes the existing full route guard.
    const accepted = commitAcceptedRouteProjection(trip, { basedOnInputKey: routeProjectionInputKey(trip), projectedTrip: trip, reason: 'necessary_reconciliation' });
    if (accepted.kind === 'accepted')
        return accepted.trip;
    const unit: Unit = { kind: 'assessment', targetId: trip.id, basisKey: basis(trip, 'assessment', trip.id)!, phase: 'conflict', reason: 'invalid-bindings' };
    return install(trip, [...residual, unit]);
}
export function mergeBuilderProjectionResponse(current: CanonicalEasyTTrip, response: BuilderProjectionResponse, expected: {
    scope: BuilderEditScope;
    requestId: string;
    dispatched: Unit[];
}): {
    ok: true;
    trip: CanonicalEasyTTrip;
} | {
    ok: false;
    reason: 'stale' | 'invalid';
} {
    if (authoredContentKey(response.scope) !== authoredContentKey(expected.scope) || response.scope.ownerId !== current.ownerId || response.scope.tripId !== current.id || response.requestId !== expected.requestId || response.inputKey !== routeProjectionInputKey(current) || authoredContentKey(response.dispatched) !== authoredContentKey(expected.dispatched))
        return { ok: false, reason: 'stale' };
    if (!Array.isArray(response.results) || !Array.isArray(response.legs))
        return { ok: false, reason: "invalid" };
    const residual = structuredClone(current.brief.cascadeStatus?.routeReconciliation?.residual ?? []);
    let trip = structuredClone(current);
    const seen = new Set<string>();
    for (const result of response.results) {
        const id = unitId(result);
        if (seen.has(id))
            return { ok: false, reason: 'invalid' };
        seen.add(id);
        const dispatched = expected.dispatched.find(u => unitId(u) === id);
        const index = residual.findIndex(u => unitId(u) === id);
        const unit = residual[index];
        if (!unit || !dispatched || unit.phase !== 'pending' || unit.basisKey !== result.basisKey || dispatched.basisKey !== unit.basisKey || basis(current, unit.kind, unit.targetId) !== unit.basisKey)
            return { ok: false, reason: 'stale' };
        if (result.phase === 'complete') {
            if (unit.kind === 'recommendation') {
                const projections = response.recommendationProjections;
                const matches = Array.isArray(projections) ? projections.filter(item => item?.stopId === unit.targetId) : [];
                const days = current.planItems.filter(day => day.stopId === unit.targetId);
                const projection = matches[0];
                if (matches.length !== 1 || !Array.isArray(projection.days) || projection.days.length !== days.length
                    || new Set(projection.days.map(day => day?.id)).size !== days.length
                    || projection.days.some(day => !days.some(currentDay => currentDay.id === day?.id)
                        || !Array.isArray(day.contextNotes) || day.contextNotes.some(note => typeof note !== 'string' || note.length > 10000)))
                    return { ok: false, reason: 'invalid' };
                // Copy only generated context for the successful occurrence, never a provider's whole day.
                trip.planItems = trip.planItems.map(day => day.stopId === unit.targetId
                    ? { ...day, contextNotes: structuredClone(projection.days.find(item => item.id === day.id)!.contextNotes) } : day);
            }
            if (unit.kind === 'leg') {
                const old = current.legs.find(l => l.id === unit.targetId)!;
                const leg = response.legs.find(l => l.id === unit.targetId);
                if (!leg || pair(leg) !== pair(old) || authoredContentKey([place(leg.fromEndpoint ?? null), place(leg.toEndpoint ?? null)]) !== authoredContentKey([place(routeEndpointForLeg(current, old, 'from')), place(routeEndpointForLeg(current, old, 'to'))]))
                    return { ok: false, reason: 'invalid' };
                if (!leg.routeMetadata || typeof leg.routeMetadata !== "object" || Array.isArray(leg.routeMetadata)
                    || [leg.durationMinutes, leg.headlineMinutes, leg.doorToDoorMinutes].some(value => value != null && (!Number.isFinite(value) || value < 0))
                    || (leg.mode === "unknown" && [leg.durationMinutes, leg.headlineMinutes, leg.doorToDoorMinutes].some(value => value != null)))
                    return { ok: false, reason: "invalid" };
                if (selectedTransportChoiceForLeg(current, leg) && !selectedChoiceHasCurrentEvidence(current, leg))
                    return { ok: false, reason: "invalid" };
                const { pending: _pending, ...metadata } = leg.routeMetadata;
                trip.legs = trip.legs.map(l => l.id === leg.id ? withAcceptedTransportChoice(current, old, { ...structuredClone(leg), routeMetadata: metadata }) : l);
            }
            if (unit.kind === "assessment" && response.routeAssessment !== undefined)
                trip.brief.routeAssessment = structuredClone(response.routeAssessment);
            residual.splice(index, 1);
        }
        else
            residual[index] = { ...unit, phase: result.phase, ...(result.reason ? { reason: result.reason } : {}) };
    }
    try {
        return { ok: true, trip: prepareTripDocumentForWrite(finish(trip, residual)) };
    }
    catch {
        return { ok: false, reason: 'invalid' };
    }
}
/** Deterministic schedule/assessment work; external leg/recommendation work remains pending. */
export function reconcileBuilderDependencies(current: CanonicalEasyTTrip, pendingUnits: Unit[]): {
    ok: true;
    trip: CanonicalEasyTTrip;
} | {
    ok: false;
    trip: CanonicalEasyTTrip;
    reason: 'conflict' | 'unavailable';
} {
    const valid = pendingUnits.filter(dispatched => unitsFor(current).some(unit => unitId(unit) === unitId(dispatched)
        && unit.phase === "pending" && unit.basisKey === dispatched.basisKey && basis(current, unit.kind, unit.targetId) === unit.basisKey));
    const schedule = valid.some(unit => unit.kind === "schedule" || unit.kind === "assessment")
        ? projectBuilderCalendar(current, current) : { trip: current, status: current.brief.cascadeStatus ?? { conflicts: [], affectedBookingIds: [], affectedPlanItemCount: 0 } };
    let trip = schedule.trip === current ? structuredClone(current) : reconcileAuthoredDayState(current, schedule.trip) as CanonicalEasyTTrip;
    const residual = structuredClone(unitsFor(current));
    const constraints = { avoidDriving: current.brief.intent.hardConstraints.avoidDriving,
        excludedTransportModes: current.brief.intent.hardConstraints.avoidDriving ? ["road" as const] : [],
        transportModes: current.brief.intent.preferences.transportModes,
        fixedCommitments: current.brief.intent.hardConstraints.fixedCommitments };
    const generated = valid.some(unit => unit.kind === "leg") ? buildCanonicalTripLegs({ tripId: trip.id,
        origin: { ...(trip.brief.intent.route.origin ?? { name: "" }), coordinates: trip.brief.intent.route.origin?.coordinates ?? null },
        journeyEnd: trip.brief.intent.route.journeyEnd, stops: trip.stops, constraints, curatedRoute: trip.brief.curatedRoute }) : [];
    for (const dispatched of valid) {
        const index = residual.findIndex(unit => unitId(unit) === unitId(dispatched));
        if (dispatched.kind === "leg") {
            const currentLeg = trip.legs.find(leg => leg.id === dispatched.targetId)!;
            const calculated = generated.find(leg => pair(leg) === pair(currentLeg));
            if (!calculated) {
                residual[index] = { ...residual[index], phase: "conflict", reason: "invalid-bindings" };
                continue;
            }
            trip.legs = trip.legs.map(leg => leg.id === currentLeg.id ? withAcceptedTransportChoice(trip, currentLeg, { ...calculated, id: currentLeg.id }) : leg);
            residual.splice(index, 1);
        }
        else if (dispatched.kind === "recommendation") {
            // Discovery and generated day guidance are supplied by the session adapter.
            // This deterministic worker must not acknowledge an unavailable provider calculation.
            residual[index] = { ...residual[index], phase: "failed", reason: "unavailable" };
        }
        else if (trip.brief.cascadeStatus?.conflicts.length && dispatched.kind !== "endpoint") {
            residual[index] = { ...residual[index], phase: "conflict", reason: "protected-date" };
        }
        else {
            if (dispatched.kind === "assessment") {
                const routingTrip = guardTripRoutingGeometry(trip);
                trip.brief.routeAssessment = routeIntelligenceForPersistence(assessRouteIntelligence({
                    origin: { name: trip.brief.origin, coordinates: originPlaceFromBrief(routingTrip.brief).coordinates },
                    end: plannerEndpointForJourneyEnd(trip.id, originPlaceFromBrief(routingTrip.brief), routingTrip.brief.journeyEnd),
                    stops: routingTrip.stops.map(stop => ({ id: stop.id, name: stop.name, country: stop.country, canonicalPlaceId: stop.canonicalPlaceId,
                        coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] as [
                            number,
                            number
                        ] : undefined })),
                    picks: trip.brief.selectedPlaces, availableDays: trip.brief.intent.timing.durationDays, constraints,
                    allocations: Object.fromEntries(trip.stops.map(stop => [stop.id, Math.max(1, (stop.nights ?? 0) + 1)])),
                }));
            }
            residual.splice(index, 1);
        }
    }
    trip = finish(trip, residual);
    if (unitsFor(trip).some(unit => unit.phase === "conflict"))
        return { ok: false, trip, reason: "conflict" };
    if (unitsFor(trip).some(unit => unit.phase === "failed"))
        return { ok: false, trip, reason: "unavailable" };
    return { ok: true, trip };
}
const unitsFor = (trip: CanonicalEasyTTrip) => trip.brief.cascadeStatus?.routeReconciliation?.residual ?? [];
export function retryBuilderReconciliationUnit(trip: CanonicalEasyTTrip, expected: Unit): {
    ok: true;
    trip: CanonicalEasyTTrip;
} | {
    ok: false;
    reason: "stale";
} {
    const residual = structuredClone(unitsFor(trip));
    const index = residual.findIndex(unit => unitId(unit) === unitId(expected) && unit.basisKey === expected.basisKey && unit.phase === "failed");
    if (index < 0 || basis(trip, expected.kind, expected.targetId) !== expected.basisKey)
        return { ok: false, reason: "stale" };
    const { reason: _reason, ...unit } = residual[index];
    residual[index] = { ...unit, phase: "pending" };
    return { ok: true, trip: install(trip, residual) };
}
