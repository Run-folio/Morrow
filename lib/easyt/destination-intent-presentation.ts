import { destinationPlanningDecision, type DestinationPlanningInput } from './destination-planning-policy.ts';
import { findCatalogPlaceById } from './place-catalog.ts';
import type { DestinationIntent } from './trip.ts';
import { geographicallyReady } from './geographic-binding.ts';

type Language = 'en' | 'es';
export type NamedDestinationPresentation = { name: string; placeType?: string; country?: string };

/** Presentation only: never changes the selected entity, routing proof or intent. */
export function destinationSelectionCategory(input: DestinationPlanningInput): 'stop' | 'area' | 'visit' | 'unconfirmed' {
  const decision = destinationPlanningDecision(input);
  if (decision.behavior === 'confirm') return 'unconfirmed';
  if (decision.behavior === 'direct-stop') return 'stop';
  return input.placeType === 'landmark' || input.routability === 'anchor_or_poi' ? 'visit' : 'area';
}

export function destinationTypeLabel(placeType: string | undefined, language: Language = 'en') {
  const labels: Record<string, [string, string]> = {
    country: ['Country', 'País'], continent: ['Continent', 'Continente'], city: ['City', 'Ciudad'], town: ['Town', 'Localidad'],
    island: ['Island', 'Isla'], archipelago: ['Island group', 'Archipiélago'], landmark: ['Place of interest', 'Lugar de interés'],
    transport_gateway: ['Transport hub', 'Centro de transporte'], unknown: ['Place', 'Lugar'],
  };
  return labels[placeType ?? 'unknown']?.[language === 'es' ? 1 : 0] ?? (language === 'es' ? 'Zona' : 'Area');
}

export function destinationSelectionLabel(input: NamedDestinationPresentation, peers: readonly NamedDestinationPresentation[], language: Language = 'en') {
  const sameName = peers.filter(peer => peer.name.trim().toLocaleLowerCase() === input.name.trim().toLocaleLowerCase());
  if (sameName.length < 2) return input.name;
  const detail = destinationTypeLabel(input.placeType, language);
  const differentCountry = sameName.some(peer => peer.placeType === input.placeType && peer.country && input.country && peer.country !== input.country);
  return `${input.name} · ${detail}${differentCountry ? ` · ${input.country}` : ''}`;
}

export function destinationIntentPresentationInput(intent: DestinationIntent): NamedDestinationPresentation {
  const place = intent.selectedPlace;
  const catalog = place?.canonicalPlaceId ? findCatalogPlaceById(place.canonicalPlaceId) : undefined;
  const boundType = place?.geographicBinding && geographicallyReady(place, 'endpoint') ? place.geographicBinding.placeType : undefined;
  return { name: place?.name ?? intent.sourceText, country: place?.country,
    placeType: boundType ?? catalog?.placeType ?? (intent.kind === 'planning_area' ? 'region' : undefined) };
}
