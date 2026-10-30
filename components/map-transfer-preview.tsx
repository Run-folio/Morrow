import { formatMapDuration, type MapRouteLeg } from '@/lib/easyt/map-spatial-context';

/** Display only: qualified labels come from the shared trip timing formatter.
 * Raw map minutes may include legacy impact fallbacks and are not display evidence. */
export function MapTransferPreview({ leg }: { leg: MapRouteLeg }) {
  const headline = leg.headlineLabel ?? 'Not available';
  const total = leg.totalLabel ?? 'Timing to confirm';
  const hasTiming = headline !== 'Not available' || total !== 'Timing to confirm';
  const estimated = headline.startsWith('~') || total.startsWith('~');
  return <span className="planner-map__leg-card" aria-hidden="true">
    <span className="planner-map__leg-meta"><strong>{leg.modeLabel.toLocaleUpperCase()}</strong><em>{headline}</em></span>
    <b>{leg.fromName} → {leg.toName}</b>
    <span>{leg.distanceKm !== null ? `${Math.round(leg.distanceKm).toLocaleString()} km` : 'Distance not available'} · Door-to-door {total}</span>
    <small>{leg.roadEstimate
      ? `Road estimate only · about ${formatMapDuration(leg.roadEstimate.durationMinutes)} driving`
      : !hasTiming ? 'Timing to confirm' : estimated ? 'Planning estimate' : 'Check details before booking'}</small>
  </span>;
}
