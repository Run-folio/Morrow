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
