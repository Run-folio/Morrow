const MORROVIA_CLOUDINARY_UPLOAD = "https://res.cloudinary.com/dbt3wkwa3/image/upload/";
const MAX_HOMEPAGE_HERO_WIDTH = 1920;
const HOMEPAGE_ROUTE_CARD_WIDTHS = [384, 768] as const;

/** Direct Cloudinary delivery for the gated first-party Homepage hero only. */
export function homepageCloudinaryImageLoader({ src, width }: { src: string; width: number; quality?: number }) {
  if (!src.startsWith(MORROVIA_CLOUDINARY_UPLOAD)) {
    throw new Error("Homepage first-party photography must use Morrovia's Cloudinary account.");
  }
  const requestedWidth = Math.min(MAX_HOMEPAGE_HERO_WIDTH, Math.max(1, Math.round(width)));
  return src.replace(MORROVIA_CLOUDINARY_UPLOAD, `${MORROVIA_CLOUDINARY_UPLOAD}f_auto,q_auto:low,c_limit,w_${requestedWidth}/`);
}

/** Stable 1x/2x card sources; the original remains the reviewed source record. */
export function homepageRouteCardCloudinaryVariants(src: string) {
  if (!src.startsWith(MORROVIA_CLOUDINARY_UPLOAD)) {
    throw new Error("Homepage route-card photography must use Morrovia's Cloudinary account.");
  }
  return HOMEPAGE_ROUTE_CARD_WIDTHS.map(width => ({
    width,
    src: src.replace(MORROVIA_CLOUDINARY_UPLOAD, `${MORROVIA_CLOUDINARY_UPLOAD}f_auto,q_auto,c_limit,w_${width}/`),
  }));
}
