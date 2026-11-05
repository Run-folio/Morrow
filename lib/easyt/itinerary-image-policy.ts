import {canonicalImageSource, commonsImageIdentity, viatorImageIdentity} from './image-source-identity.ts';
import {routePhotoAssetIdentity,routePhotoForSource} from './route-images.ts';
import type {OverviewPlaceImage} from './trip-overview-imagery.ts';

export function itineraryImageIdentity(image: OverviewPlaceImage): string {
  const normalized = canonicalImageSource(image.src);
  const reviewed = routePhotoForSource(image.src) ?? (image.sourceUrl ? routePhotoForSource(image.sourceUrl) : null);
  return (reviewed ? routePhotoAssetIdentity(reviewed) : null) ?? commonsImageIdentity(normalized)
    ?? viatorImageIdentity(normalized) ?? commonsImageIdentity(image.sourceUrl ?? '')
    ?? reviewed?.sourceUrl ?? normalized;
}
