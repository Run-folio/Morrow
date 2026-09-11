const MORROVIA_CLOUDINARY_UPLOAD = "https://res.cloudinary.com/dbt3wkwa3/image/upload/";
const MAX_HOMEPAGE_HERO_WIDTH = 1920;

/** Direct Cloudinary delivery for the gated first-party Homepage hero only. */
export function homepageCloudinaryImageLoader({ src, width }: { src: string; width: number; quality?: number }) {
  if (!src.startsWith(MORROVIA_CLOUDINARY_UPLOAD)) {
    throw new Error("Homepage first-party photography must use Morrovia's Cloudinary account.");
  }
  const requestedWidth = Math.min(MAX_HOMEPAGE_HERO_WIDTH, Math.max(1, Math.round(width)));
  return src.replace(MORROVIA_CLOUDINARY_UPLOAD, `${MORROVIA_CLOUDINARY_UPLOAD}f_auto,q_auto:low,c_limit,w_${requestedWidth}/`);
}
