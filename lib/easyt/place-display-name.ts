export type ProviderPlaceNameFields = {
  defaultName?: string;
  localizedNames?: Record<string, string | undefined>;
  internationalName?: string;
  transliteratedNames?: string[];
  alternativeNames?: string[];
  nativeNames?: string[];
};

export type PlaceDisplayName = {
  name: string;
  nativeName?: string;
};

function clean(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() || undefined;
}

function uniqueNames(values: Array<string | undefined>) {
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const normalized = clean(value);
    if (!normalized) return [];
    const key = normalized.toLocaleLowerCase();
    if (seen.has(key)) return [];
    seen.add(key);
    return [normalized];
  });
}

function usesOnlyLatinLetters(value: string) {
  const letters = [...value].filter((character) => /\p{L}/u.test(character));
  return letters.length > 0 && letters.every((character) => /\p{Script=Latin}/u.test(character));
}

function usesNonLatinLetters(value: string) {
  return [...value].some((character) => /\p{L}/u.test(character) && !/\p{Script=Latin}/u.test(character));
}

/** Split only a provider-supplied bilingual parenthetical; never invent text. */
export function splitProviderCombinedName(value: string | undefined) {
  const normalized = clean(value);
  if (!normalized) return null;
  const match = normalized.match(/^(.+?)\s*[（(]\s*([^()（）]+?)\s*[)）]$/u);
  if (!match) return null;
  const outside = clean(match[1]);
  const inside = clean(match[2]);
  if (!outside || !inside) return null;
  if (usesOnlyLatinLetters(outside) && usesNonLatinLetters(inside)) return { latin: outside, native: inside };
  if (usesNonLatinLetters(outside) && usesOnlyLatinLetters(inside)) return { latin: inside, native: outside };
  return null;
}

/**
 * Resolve a provider-neutral display name from supplied metadata. English UI
 * prefers an explicit English/international name, then supplied Latin
 * transliterations/alternatives, and finally the authentic provider name.
 */
export function resolvePlaceDisplayName(fields: ProviderPlaceNameFields, locale = "en"): PlaceDisplayName | null {
  const normalizedLocale = locale.trim().toLocaleLowerCase().replaceAll("_", "-");
  const language = normalizedLocale.split("-")[0] || "en";
  const localized = fields.localizedNames ?? {};
  const exactLocalized = clean(localized[normalizedLocale])
    ?? clean(localized[language])
    ?? clean(Object.entries(localized).find(([key]) => key.toLocaleLowerCase().split(/[-_]/)[0] === language)?.[1]);
  const defaultCombined = splitProviderCombinedName(fields.defaultName);
  const localizedCombined = splitProviderCombinedName(exactLocalized);
  const internationalCombined = splitProviderCombinedName(fields.internationalName);
  const alternatives = uniqueNames(fields.alternativeNames ?? []);
  const transliterations = uniqueNames(fields.transliteratedNames ?? []);

  const primaryCandidates = language === "en"
    ? uniqueNames([
        localizedCombined?.latin ?? (exactLocalized && usesOnlyLatinLetters(exactLocalized) ? exactLocalized : undefined),
        internationalCombined?.latin ?? (fields.internationalName && usesOnlyLatinLetters(fields.internationalName) ? fields.internationalName : undefined),
        ...transliterations.filter(usesOnlyLatinLetters),
        ...alternatives.filter(usesOnlyLatinLetters),
        defaultCombined?.latin,
        fields.defaultName,
      ])
    : uniqueNames([
        exactLocalized,
        fields.internationalName,
        ...transliterations,
        fields.defaultName,
      ]);
  const name = primaryCandidates[0];
  if (!name) return null;

  const nativeCandidates = uniqueNames([
    defaultCombined?.native,
    localizedCombined?.native,
    internationalCombined?.native,
    fields.defaultName,
    ...(fields.nativeNames ?? []),
  ]).filter((candidate) => candidate.toLocaleLowerCase() !== name.toLocaleLowerCase() && usesNonLatinLetters(candidate));
  return nativeCandidates[0] ? { name, nativeName: nativeCandidates[0] } : { name };
}

export function resolveOsmPlaceDisplayName(tags: Record<string, string>, locale = "en") {
  const localizedNames: Record<string, string> = {};
  const transliteratedNames: string[] = [];
  const nativeNames: string[] = [];
  for (const [key, value] of Object.entries(tags)) {
    if (/^name:[^:]+$/i.test(key)) localizedNames[key.slice(5).toLocaleLowerCase()] = value;
    if (/^official_name:[^:]+$/i.test(key)) localizedNames[key.slice(14).toLocaleLowerCase()] ??= value;
    if (/^name:(?:latin|[^:]+-latn)$/i.test(key)) transliteratedNames.push(value);
    if (/^(?:name|official_name):[^:]+$/i.test(key) && usesNonLatinLetters(value)) nativeNames.push(value);
  }
  const alternativeNames = [tags.alt_name, tags.loc_name, tags.short_name]
    .flatMap((value) => value?.split(";") ?? []);
  return resolvePlaceDisplayName({
    defaultName: tags.name,
    localizedNames,
    internationalName: tags.int_name,
    transliteratedNames,
    alternativeNames,
    nativeNames,
  }, locale);
}
