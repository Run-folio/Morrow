export type PhotoAttributionInput = {
  credit: string;
  authorHref?: string | null;
  sourceHref?: string | null;
  licenseHref?: string | null;
};

export type PhotoAttribution =
  | { kind: "unsplash"; photographer: string; photographerHref: string; sourceLabel: "Unsplash"; sourceHref: string; licenseHref: string | null }
  | { kind: "source"; credit: string; sourceHref: string; licenseHref: string | null };

function validWebUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function hasUnsplashReferral(value: string) {
  const url = new URL(value);
  url.searchParams.set("utm_source", "morrovia");
  url.searchParams.set("utm_medium", "referral");
  return url.toString();
}

export function describePhotoAttribution(input: PhotoAttributionInput): PhotoAttribution | null {
  const credit = input.credit.trim();
  if (!credit || !validWebUrl(input.sourceHref)) return null;
  const unsplashCredit = credit.match(/^Photo by (.+) on Unsplash$/i);
  const creditParts = credit.split("·").map((part) => part.trim());
  const curatedUnsplashCredit = /^Unsplash License$/i.test(creditParts.at(-1) ?? "") && creditParts.length > 1;
  const photographer = unsplashCredit?.[1]?.trim() ?? (curatedUnsplashCredit ? creditParts.at(-2) : undefined);
  const photographerHref = unsplashCredit ? input.sourceHref : input.authorHref;
  if (unsplashCredit || curatedUnsplashCredit) {
    if (!photographer || !validWebUrl(photographerHref)) return null;
    const photographerUrl = new URL(photographerHref);
    const sourceUrl = new URL(input.sourceHref);
    const isUnsplashHost = (url: URL) => url.hostname === "unsplash.com" || url.hostname === "www.unsplash.com";
    if (!isUnsplashHost(photographerUrl) || !isUnsplashHost(sourceUrl)) return null;
    return {
      kind: "unsplash",
      photographer,
      photographerHref,
      sourceLabel: "Unsplash",
      sourceHref: unsplashCredit ? hasUnsplashReferral("https://unsplash.com/") : input.sourceHref,
      licenseHref: validWebUrl(input.licenseHref) ? input.licenseHref : null,
    };
  }
  return {
    kind: "source",
    credit,
    sourceHref: input.sourceHref,
    licenseHref: validWebUrl(input.licenseHref) ? input.licenseHref : null,
  };
}

/** Runtime Commons selections require reusable rights and a matching official licence URL. */
export function isReusableWikimediaLicense(license: string, licenseUrl: string): boolean {
  try {
    const url = new URL(licenseUrl);
    if (url.protocol !== "https:" || !["creativecommons.org", "www.creativecommons.org"].includes(url.hostname)) return false;
    const cc = /^CC (BY(?:-SA)?) (1\.0|2\.0|2\.5|3\.0|4\.0)$/i.exec(license.trim());
    if (cc) return url.pathname === `/licenses/${cc[1]!.toLowerCase()}/${cc[2]}/` ||
      url.pathname === `/licenses/${cc[1]!.toLowerCase()}/${cc[2]}`;
    if (/^CC ?0(?: 1\.0)?$/i.test(license.trim())) return /^\/publicdomain\/zero\/1\.0\/?$/.test(url.pathname);
    return /^Public domain$/i.test(license.trim()) && /^\/publicdomain\/(?:zero|mark)\/1\.0\/?$/.test(url.pathname);
  } catch { return false; }
}
