import { preservedTransferFacts, transferEndpointGeographicallyReady } from './geographic-binding.ts';
import { requestCanonicalTransferResolution, completedTransferResolutionLeg } from './transfer-resolution-client.ts';
import type { EasyTTrip } from './trip.ts';
import { retainFailedImportTransferWork } from './trip-builder-reconciliation.ts';

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
  let payload: Awaited<ReturnType<typeof assess>>;
  try { payload = await assess(eligible, signal); }
  catch {
    signal.throwIfAborted();
    return retainFailedImportTransferWork(trip, eligible.map(leg => leg.id));
  }
  signal.throwIfAborted();
  if (!payload.ok) return retainFailedImportTransferWork(trip, eligible.map(leg => leg.id));
  const resolved = new Map(eligible.flatMap(expected => {
    const leg = completedTransferResolutionLeg(expected, payload);
    return leg ? [[leg.id, leg] as const] : [];
  }));
  const assessed = { ...trip, legs: trip.legs.map(leg => resolved.get(leg.id) ?? leg) };
  return retainFailedImportTransferWork(assessed, eligible.filter(leg => !resolved.has(leg.id)).map(leg => leg.id));
}
