import {omioHandoffIssue} from './omio-search-link.ts';
import type {CanonicalRouteEndpoint, TransferSegment, TripLeg} from './trip.ts';

export type JourneyPartGap = {kind: 'access' | 'connection' | 'onward'; from: CanonicalRouteEndpoint; to: CanonicalRouteEndpoint} | {kind: 'departure-airport'};
const endpoint = (value: unknown): value is CanonicalRouteEndpoint => !!value && typeof value === 'object'
  && typeof (value as CanonicalRouteEndpoint).id === 'string' && typeof (value as CanonicalRouteEndpoint).name === 'string'
  && !!(value as CanonicalRouteEndpoint).name.trim()
  && ((value as CanonicalRouteEndpoint).country == null || typeof (value as CanonicalRouteEndpoint).country === 'string');
const modes = new Set(['flight', 'train', 'road', 'ferry', 'walk', 'unknown']);
const segment = (value: unknown): value is TransferSegment => !!value && typeof value === 'object'
  && typeof (value as TransferSegment).id === 'string' && modes.has((value as TransferSegment).mode)
  && endpoint((value as TransferSegment).fromEndpoint) && endpoint((value as TransferSegment).toEndpoint);
function samePlace(a: CanonicalRouteEndpoint, b: CanonicalRouteEndpoint) {
  // A canonical place can have multiple saved coordinate snapshots. That is
  // not evidence of a transfer between two different places.
  if (a.canonicalPlaceId && b.canonicalPlaceId) return a.canonicalPlaceId === b.canonicalPlaceId;
  const coordinatesAgree = !a.coordinates || !b.coordinates || (a.coordinates[0] === b.coordinates[0] && a.coordinates[1] === b.coordinates[1]);
  if (!coordinatesAgree) return false;
  if (a.coordinates && b.coordinates && a.name === b.name && a.country === b.country) return true;
  return a.id === b.id && a.name === b.name && a.country === b.country;
}

/** Read-only presentation of explicit saved parts, never a routing or booking authority.
 * A gap means details are absent from this chain; it says nothing about whether
 * the traveller has separately arranged that travel. No gateway is inferred. */
export function transportJourneyParts(leg: TripLeg): {parts: TransferSegment[]; gaps: JourneyPartGap[]; incomplete: boolean} {
  const saved = leg.segments;
  const parts = Array.isArray(saved) ? saved.filter(segment) : [];
  const incomplete = saved != null && (!Array.isArray(saved) || parts.length !== saved.length);
  const gaps: JourneyPartGap[] = [];
  if (incomplete) return {parts, gaps, incomplete};
  const flight = parts.find(part => part.mode === 'flight');
  if (flight) {
    const first = parts[0]!, last = parts[parts.length - 1]!;
    if (endpoint(leg.fromEndpoint) && !samePlace(leg.fromEndpoint, first.fromEndpoint)) gaps.push({kind:'access', from:leg.fromEndpoint, to:first.fromEndpoint});
    for (let i=1;i<parts.length;i++) {
      const previous = parts[i-1]!, current = parts[i]!;
      if (!samePlace(previous.toEndpoint, current.fromEndpoint)) gaps.push({kind:'connection', from:previous.toEndpoint, to:current.fromEndpoint});
    }
    if (endpoint(leg.toEndpoint) && !samePlace(last.toEndpoint, leg.toEndpoint)) gaps.push({kind:'onward', from:last.toEndpoint, to:leg.toEndpoint});
  }
  const from = flight?.fromEndpoint ?? leg.fromEndpoint, to = flight?.toEndpoint ?? leg.toEndpoint;
  if ((flight || leg.mode === 'flight') && endpoint(from) && endpoint(to)
    && omioHandoffIssue({mode:'flight', originName:from.name, originCountry:from.country ?? '', destinationName:to.name, destinationCountry:to.country ?? '', departureDate:null}) === 'departure-airport-required') {
    gaps.push({kind:'departure-airport'});
  }
  return {parts, gaps, incomplete};
}

export function journeyPartGapLabel(gap: JourneyPartGap, language: 'en'|'es'): string {
  if (gap.kind === 'departure-airport') return language === 'es'
    ? 'El aeropuerto de salida y cómo llegar necesitan confirmación.'
    : 'Departure airport and travel to it need checking.';
  const route = `${gap.from.name} → ${gap.to.name}`;
  return language === 'es' ? `No se muestran los detalles del traslado: ${route}.` : `Travel details not shown: ${route}.`;
}
