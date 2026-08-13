export type TravelReadinessProfile = {
  nationalities: string[];
  residenceCountry: string;
  passportExpiryMonth: string;
};

export const defaultTravelReadinessProfile: TravelReadinessProfile = {
  nationalities: [],
  residenceCountry: "",
  passportExpiryMonth: "",
};

const cleanCountry = (value: string) => value.trim().replace(/\s+/g, " ");

export const isTravelReadinessProfile = (value: unknown): value is TravelReadinessProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<TravelReadinessProfile>;
  return Array.isArray(profile.nationalities)
    && profile.nationalities.every((country) => typeof country === "string" && cleanCountry(country).length > 0 && country.length <= 100)
    && typeof profile.residenceCountry === "string"
    && typeof profile.passportExpiryMonth === "string"
    && profile.nationalities.length <= 4
    && profile.residenceCountry.length <= 100
    && (!profile.passportExpiryMonth || /^\d{4}-(0[1-9]|1[0-2])$/.test(profile.passportExpiryMonth));
};

export type ReadinessCard = {
  id: "entry" | "passport" | "esim" | "insurance" | "driving" | "china-internet";
  priority: "essential" | "useful";
  title: string;
  detail: string;
  note?: string;
  href?: string;
  cta?: string;
  partner?: "saily";
};

type ReadinessInput = {
  countries: string[];
  startDate?: string;
  profile: TravelReadinessProfile;
  sailyHref?: string;
};

const adviceSourceFor = (residence: string) => {
  const normalized = residence.toLowerCase();
  if (["united kingdom", "uk", "great britain"].includes(normalized)) {
    return { href: "https://www.gov.uk/foreign-travel-advice", cta: "Check UK travel advice" };
  }
  if (["united states", "usa", "us", "united states of america"].includes(normalized)) {
    return { href: "https://travel.state.gov/content/travel/en/international-travel.html", cta: "Check US travel guidance" };
  }
  if (["canada"].includes(normalized)) {
    return { href: "https://travel.gc.ca/travelling/advisories", cta: "Check Canada travel advice" };
  }
  return undefined;
};

export const buildTripReadiness = ({ countries, startDate, profile, sailyHref }: ReadinessInput): ReadinessCard[] => {
  const destinations = [...new Set(countries.map(cleanCountry).filter(Boolean))];
  if (!destinations.length) return [];
  const advice = adviceSourceFor(profile.residenceCountry);
  const cards: ReadinessCard[] = [{
    id: "entry",
    priority: "essential",
    title: "Entry and transit checks",
    detail: profile.nationalities.length
      ? `Entry, visa and transit rules can vary by nationality, residence and route for ${destinations.join(", ")}. Check the official requirements before making non-refundable bookings.`
      : "Add your nationality to make this trip-prep checklist more personal. Entry, visa and transit rules must always be checked with an official source before booking.",
    note: "Morrovia is not a visa decision service.",
    ...advice,
  }, {
    id: "passport",
    priority: "essential",
    title: "Passport validity",
    detail: profile.passportExpiryMonth
      ? `Your saved passport expiry month is ${profile.passportExpiryMonth}. Check each destination's required validity beyond your return date.`
      : "Some destinations require passport validity beyond your return date. Add an expiry month if you want this reminder to be more useful.",
    note: "Never add a passport number, scan or document image here.",
  }];

  const isInternational = !profile.residenceCountry || destinations.some((country) => country.toLowerCase() !== profile.residenceCountry.toLowerCase());
  if (isInternational) cards.push({
    id: "esim",
    priority: "useful",
    title: "Stay connected",
    detail: "Compare an eSIM before you leave so maps, confirmations and messages work when you arrive.",
    href: sailyHref || "https://saily.com/",
    cta: "Explore eSIM options",
    ...(sailyHref ? { partner: "saily" as const } : {}),
  }, {
    id: "insurance",
    priority: "useful",
    title: "Travel insurance",
    detail: "Compare medical cover, cancellation protection, activities and any destination-specific exclusions before you travel.",
  });

  if (destinations.some((country) => country.toLowerCase() === "china")) cards.push({
    id: "china-internet",
    priority: "essential",
    title: "Internet access in mainland China",
    detail: "Some online services you normally use may not work as expected. Review connectivity options and any local requirements before departure.",
    note: "Do not rely on a connectivity setup without testing the latest destination guidance first.",
  });

  if (destinations.length > 1 || /usa|united states|australia|new zealand|iceland|south africa|costa rica/i.test(destinations.join(" "))) cards.push({
    id: "driving",
    priority: "useful",
    title: "If you plan to drive",
    detail: "Check licence acceptance, insurance excess, age limits, cross-border rules and whether a car is genuinely the best fit for this route.",
  });

  return cards;
};
