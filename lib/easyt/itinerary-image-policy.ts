import {commonsImageIdentity, viatorImageIdentity} from './image-source-identity.ts';
import {routePhotoAssetIdentity,routePhotoForSource} from './route-images.ts';
import type {OverviewPlaceImage} from './trip-overview-imagery.ts';
import type {ItineraryIdea} from './trip.ts';

export function itineraryImageIdentity(image: OverviewPlaceImage): string {
  const reviewed = routePhotoForSource(image.src);
  return (reviewed ? routePhotoAssetIdentity(reviewed) : null) ?? commonsImageIdentity(image.src)
    ?? viatorImageIdentity(image.src) ?? commonsImageIdentity(image.sourceUrl ?? '')
    ?? reviewed?.sourceUrl ?? image.src;
}

/** Same selected supplier product only; never generic destination photography. */
export function viatorActivityPhoto(idea: ItineraryIdea): OverviewPlaceImage | null {
  const provenance = idea.providerMetadata?.provenance;
  if (idea.category !== 'activity' || idea.source !== 'live-provider-inventory' || idea.provider !== 'viator'
    || !idea.providerProductId?.trim() || !idea.image || !viatorImageIdentity(idea.image)
    || provenance?.kind !== 'live_provider_search' || provenance.provider !== 'viator' || !Number.isFinite(Date.parse(provenance.checkedAt))) return null;
  try {
    const product = new URL(idea.sourceUrl ?? '');
    if (product.protocol !== 'https:' || !(product.hostname === 'viator.com' || product.hostname.endsWith('.viator.com'))
      || product.username || product.password || !product.pathname.startsWith('/tours/') || !product.pathname.endsWith(`-${idea.providerProductId}`)) return null;
    return {src:idea.image,alt:`${idea.title} — supplier product photo`,sourceUrl:idea.sourceUrl,
      sourceLabel:'Photo supplied via Viator',activityTitle:idea.title};
  } catch { return null; }
}
