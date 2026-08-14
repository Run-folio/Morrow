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
  sources?: EntrySource[];
};

export type EntrySource = {
  country: string;
  label: string;
  href: string;
  coverage: "official" | "needs-source";
};

type EntrySourceRecord = Omit<EntrySource, "country">;

/** Launch source coverage for major travel destinations plus Guatemala. */
export const entrySourcesByCountry: Record<string, EntrySourceRecord> = {
  "Australia": { label: "Australian Department of Home Affairs", href: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing", coverage: "official" },
  "Austria": { label: "Austrian Ministry of Foreign Affairs", href: "https://www.bmeia.gv.at/en/travel-stay/entering-austria", coverage: "official" },
  "Brazil": { label: "Brazilian Ministry of Foreign Affairs", href: "https://www.gov.br/mre/en/subjects/consular-services/visas", coverage: "official" },
  "Canada": { label: "Immigration, Refugees and Citizenship Canada", href: "https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html", coverage: "official" },
  "China": { label: "Chinese Visa Application Service Center", href: "https://www.visaforchina.cn/", coverage: "official" },
  "Croatia": { label: "Croatian Ministry of Foreign and European Affairs", href: "https://mvep.gov.hr/consular-information-130742/130742", coverage: "official" },
  "Egypt": { label: "Egypt e-Visa portal", href: "https://visa2egypt.gov.eg/", coverage: "official" },
  "France": { label: "France-Visas", href: "https://france-visas.gouv.fr/", coverage: "official" },
  "Germany": { label: "German Federal Foreign Office", href: "https://www.auswaertiges-amt.de/en/visa-service", coverage: "official" },
  "Greece": { label: "Greek Ministry of Foreign Affairs", href: "https://www.mfa.gr/en/visa/", coverage: "official" },
  "Guatemala": { label: "Guatemalan Institute of Migration", href: "https://igm.gob.gt/", coverage: "official" },
  "India": { label: "Government of India e-Visa", href: "https://indianvisaonline.gov.in/evisa/tvoa.html", coverage: "official" },
  "Indonesia": { label: "Indonesian Immigration", href: "https://www.imigrasi.go.id/", coverage: "official" },
  "Italy": { label: "Italian Ministry of Foreign Affairs – Visa for Italy", href: "https://vistoperitalia.esteri.it/home/en", coverage: "official" },
  "Japan": { label: "Ministry of Foreign Affairs of Japan", href: "https://www.mofa.go.jp/j_info/visit/visa/index.html", coverage: "official" },
  "Malaysia": { label: "Immigration Department of Malaysia", href: "https://www.imi.gov.my/", coverage: "official" },
  "Mexico": { label: "Mexican Ministry of Foreign Affairs", href: "https://embamex.sre.gob.mx/", coverage: "official" },
  "Morocco": { label: "Consular Services of Morocco", href: "https://www.consulat.ma/en/visa", coverage: "official" },
  "Netherlands": { label: "NetherlandsWorldwide", href: "https://www.netherlandsworldwide.nl/visa-the-netherlands", coverage: "official" },
  "Poland": { label: "Republic of Poland – Visa information", href: "https://www.gov.pl/web/diplomacy/visa-information", coverage: "official" },
  "Portugal": { label: "Portuguese Ministry of Foreign Affairs", href: "https://vistos.mne.gov.pt/en/", coverage: "official" },
  "Saudi Arabia": { label: "Saudi eVisa", href: "https://visa.visitsaudi.com/", coverage: "official" },
  "Singapore": { label: "Immigration & Checkpoints Authority", href: "https://www.ica.gov.sg/enter-transit-depart/entering-singapore/visa_requirements", coverage: "official" },
  "South Korea": { label: "Korea Visa Portal", href: "https://www.visa.go.kr/", coverage: "official" },
  "Spain": { label: "Spanish Ministry of Foreign Affairs", href: "https://www.exteriores.gob.es/en/ServiciosAlCiudadano/Paginas/Visados.aspx", coverage: "official" },
  "Thailand": { label: "Thai e-Visa", href: "https://www.thaievisa.go.th/", coverage: "official" },
  "Turkey": { label: "Republic of Türkiye e-Visa", href: "https://www.evisa.gov.tr/en/", coverage: "official" },
  "United Arab Emirates": { label: "UAE Government Portal – Visa and entry", href: "https://u.ae/en/information-and-services/visa-and-emirates-id", coverage: "official" },
  "United Kingdom": { label: "UK Government – Check if you need a visa", href: "https://www.gov.uk/check-uk-visa", coverage: "official" },
  "United States": { label: "US Department of State – Visitor visas", href: "https://travel.state.gov/content/travel/en/us-visas/tourism-visit/visitor.html", coverage: "official" },
  "Vietnam": { label: "Vietnam e-Visa", href: "https://evisa.gov.vn/", coverage: "official" },
  "Antigua and Barbuda": { label: "Antigua and Barbuda Immigration Department", href: "https://immigration.gov.ag/", coverage: "official" },
  "Bahamas": { label: "Government of The Bahamas – Visa information", href: "https://www.bahamas.com/visitor-visa", coverage: "official" },
  "Barbados": { label: "Barbados Immigration Department", href: "https://www.immigration.gov.bb/", coverage: "official" },
  "Belize": { label: "Belize Immigration Department", href: "https://immigration.gov.bz/", coverage: "official" },
  "Botswana": { label: "Botswana Government – Visa information", href: "https://www.gov.bw/visa", coverage: "official" },
  "Denmark": { label: "Danish Immigration Service", href: "https://www.nyidanmark.dk/en-GB/You-want-to-apply/Short-stay-visa", coverage: "official" },
  "Dominica": { label: "Government of Dominica – Visa services", href: "https://dominica.gov.dm/services/visa-application", coverage: "official" },
  "Finland": { label: "Finnish Immigration Service", href: "https://migri.fi/en/visa-to-visit-finland", coverage: "official" },
  "Ghana": { label: "Ghana Immigration Service", href: "https://gis.gov.gh/visa/", coverage: "official" },
  "Grenada": { label: "Government of Grenada – Immigration", href: "https://www.gov.gd/", coverage: "official" },
  "Guyana": { label: "Government of Guyana – Visa information", href: "https://www.minfor.gov.gy/", coverage: "official" },
  "Ireland": { label: "Irish Immigration Service", href: "https://www.irishimmigration.ie/coming-to-visit-ireland/", coverage: "official" },
  "Jamaica": { label: "Jamaica Passport, Immigration and Citizenship Agency", href: "https://www.pica.gov.jm/immigration/visa-requirements", coverage: "official" },
  "Kenya": { label: "Kenya Electronic Travel Authorisation", href: "https://www.etakenya.go.ke/", coverage: "official" },
  "Malta": { label: "Malta Identità – Visa information", href: "https://identita.gov.mt/expatriates-unit-non-eu-nationals/visa/", coverage: "official" },
  "New Zealand": { label: "Immigration New Zealand", href: "https://www.immigration.govt.nz/new-zealand-visas/visas/visa/visitor-visa", coverage: "official" },
  "Nigeria": { label: "Nigeria Immigration Service", href: "https://immigration.gov.ng/visa/", coverage: "official" },
  "Norway": { label: "Norwegian Directorate of Immigration", href: "https://www.udi.no/en/want-to-apply/visit-and-holiday/visitor-visa/", coverage: "official" },
  "Saint Kitts and Nevis": { label: "Government of Saint Kitts and Nevis", href: "https://www.gov.kn/", coverage: "official" },
  "Saint Lucia": { label: "Government of Saint Lucia – Visa services", href: "https://www.govt.lc/services/apply-for-a-visa", coverage: "official" },
  "Saint Vincent and the Grenadines": { label: "Government of Saint Vincent and the Grenadines", href: "https://www.gov.vc/", coverage: "official" },
  "South Africa": { label: "South African Department of Home Affairs", href: "https://www.dha.gov.za/index.php/applying-for-sa-visa", coverage: "official" },
  "Sweden": { label: "Swedish Migration Agency", href: "https://www.migrationsverket.se/en/you-want-to-apply/visit-sweden/visiting-sweden-up-to-90-days---apply-for-a-visa.html", coverage: "official" },
  "Trinidad and Tobago": { label: "Trinidad and Tobago Immigration Division", href: "https://www.immigration.gov.tt/", coverage: "official" },
  "Uganda": { label: "Uganda Electronic Visa", href: "https://visas.immigration.go.ug/", coverage: "official" },
  "Zambia": { label: "Zambia Department of Immigration", href: "https://www.zambiaimmigration.gov.zm/", coverage: "official" },
  "Zimbabwe": { label: "Zimbabwe e-Visa", href: "https://www.evisa.gov.zw/", coverage: "official" },
};

type ReadinessInput = {
  countries: string[];
  startDate?: string;
  profile: TravelReadinessProfile;
  sailyHref?: string;
  language?: "en" | "es";
};

const countryAliases: Record<string, string> = {
  usa: "United States", us: "United States", "united states of america": "United States",
  uk: "United Kingdom", "great britain": "United Kingdom",
  uae: "United Arab Emirates", turkiye: "Turkey", "türkiye": "Turkey",
  korea: "South Korea", "republic of korea": "South Korea",
};

export const canonicalCountry = (value: string) => countryAliases[cleanCountry(value).toLowerCase()] ?? cleanCountry(value);

export const entrySourcesFor = (countries: string[]): EntrySource[] => [...new Set(countries.map(canonicalCountry).filter(Boolean))].map((country) => {
  const source = entrySourcesByCountry[country];
  return source ? { country, ...source } : {
    country,
    label: "Official entry and visa authority",
    href: "https://www.gov.uk/foreign-travel-advice",
    coverage: "needs-source",
  };
});

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

export const buildTripReadiness = ({ countries, startDate, profile, sailyHref, language = "en" }: ReadinessInput): ReadinessCard[] => {
  const destinations = [...new Set(countries.map(canonicalCountry).filter(Boolean))];
  if (!destinations.length) return [];
  const advice = adviceSourceFor(profile.residenceCountry);
  const entrySources = entrySourcesFor(destinations);
  const uncovered = entrySources.filter((source) => source.coverage === "needs-source");
  const cards: ReadinessCard[] = [{
    id: "entry",
    priority: "essential",
    title: language === "es" ? "Entrada, visado y tránsito" : "Entry, visa and transit",
    detail: profile.nationalities.length
      ? (language === "es" ? `Las reglas para ${destinations.join(", ")} pueden variar según nacionalidad, residencia y ruta. Revisa la fuente oficial antes de reservar algo no reembolsable.` : `Rules for ${destinations.join(", ")} can vary by nationality, residence and route. Check the official source before making non-refundable bookings.`)
      : (language === "es" ? "Añade tu nacionalidad para personalizar esta comprobación. Verifica siempre los requisitos con una fuente oficial antes de reservar." : "Add your nationality to make this check more personal. Always verify requirements with an official source before booking."),
    note: uncovered.length
      ? (language === "es" ? `Aún no tenemos una fuente específica para: ${uncovered.map((source) => source.country).join(", ")}.` : `We have not yet added a destination-specific source for: ${uncovered.map((source) => source.country).join(", ")}.`)
      : (language === "es" ? "Morrovia no toma decisiones de visado." : "Morrovia is not a visa decision service."),
    ...advice,
    sources: entrySources,
  }, {
    id: "passport",
    priority: "essential",
    title: "Passport validity",
    detail: profile.passportExpiryMonth
      ? `Your saved passport expiry month is ${profile.passportExpiryMonth}. Check each destination's required validity beyond your return date.`
      : "Some destinations require passport validity beyond your return date. Add an expiry month if you want this reminder to be more useful.",
    note: "Never add a passport number, scan or document image here.",
  }];

  const isInternational = !profile.residenceCountry || destinations.some((country) => country.toLowerCase() !== canonicalCountry(profile.residenceCountry).toLowerCase());
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
