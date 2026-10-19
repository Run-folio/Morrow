import { preservedTransferFacts, transferEndpointGeographicallyReady } from './geographic-binding.ts';
import { requestCanonicalTransferResolution } from './transfer-resolution-client.ts';
import type { EasyTTrip } from './trip.ts';

/** Assess only newly reviewed, unbooked legs before the existing import save. */
export async function assessSpreadsheetImportTransfers(
  trip: EasyTTrip,
  signal: AbortSignal,
  assess: typeof requestCanonicalTransferResolution = requestCanonicalTransferResolution,
): Promise<EasyTTrip> {
  signal.throwIfAborted();
  const eligible = trip.legs.filter(leg => leg.routeMetadata.source === 'spreadsheet-import-planning'
    && !leg.routeMetadata.importedBookingId && !preservedTransferFacts(leg)
    && transferEndpointGeographicallyReady(leg.fromEndpoint) && transferEndpointGeographicallyReady(leg.toEndpoint));
  if (!eligible.length) return trip;
  const payload = await assess(eligible, signal);
  signal.throwIfAborted();
  if (!payload.ok) return trip;
  const resolved = new Map(payload.legs.filter(leg => {
    const expected = eligible.find(candidate => candidate.id === leg.id);
    return expected && !payload.failedLegIds.includes(leg.id)
      && leg.fromStopId === expected.fromStopId && leg.toStopId === expected.toStopId
      && JSON.stringify(leg.fromEndpoint) === JSON.stringify(expected.fromEndpoint)
      && JSON.stringify(leg.toEndpoint) === JSON.stringify(expected.toEndpoint);
  }).map(leg => [leg.id, leg]));
  return { ...trip, legs: trip.legs.map(leg => resolved.get(leg.id) ?? leg) };
}
