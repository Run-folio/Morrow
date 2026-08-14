import { canonicalCountry, entrySourcesByCountry } from "./travel-readiness.ts";

export type TouristEntryRequirement = {
  status: "visa-free" | "no-visa" | "not-verified";
  visaAnswer: string;
  permittedStay: string;
  detail: string;
  conditions: string[];
  sourceLabel: string;
  sourceHref: string;
  checkedOn: string;
};

const SCHENGEN_DESTINATIONS = new Set([
  "Austria", "Croatia", "Denmark", "Finland", "France", "Germany", "Greece", "Italy",
  "Malta", "Netherlands", "Norway", "Poland", "Portugal", "Spain", "Sweden",
]);

const EU_EEA_PASSPORTS = new Set([
  "Denmark", "Finland", "France", "Germany", "Ireland", "Netherlands", "Norway", "Spain", "Sweden",
]);

/** Return only summaries backed by a reviewed official rule; never infer unknown pairs. */
export const touristEntryRequirementFor = (passport: string, destination: string): TouristEntryRequirement => {
  const passportCountry = canonicalCountry(passport);
  const destinationCountry = canonicalCountry(destination);

  if (passportCountry === "United Kingdom" && SCHENGEN_DESTINATIONS.has(destinationCountry)) {
    return {
      status: "visa-free",
      visaAnswer: "Not required for a tourist visit",
      permittedStay: "Up to 90 days in any 180-day period",
      detail: `This allowance is shared across the whole Schengen area, not reset in ${destinationCountry}.`,
      conditions: [
        "Previous visits to any Schengen country within the rolling 180-day period count towards the 90 days.",
        "Longer stays, work and other purposes follow different rules.",
      ],
      sourceLabel: "UK Government — travel to the EU and Schengen area",
      sourceHref: "https://www.gov.uk/travel-to-eu-schengen-area",
      checkedOn: "2026-08-14",
    };
  }

  if (EU_EEA_PASSPORTS.has(passportCountry) && SCHENGEN_DESTINATIONS.has(destinationCountry)) {
    return {
      status: "no-visa",
      visaAnswer: "Not required under free-movement rules",
      permittedStay: "Up to 3 months without residence registration",
      detail: "For longer stays, residence conditions or local registration may apply.",
      conditions: [
        "Travel with a valid passport or national identity card.",
        "Some countries may require you to report your presence after arrival.",
      ],
      sourceLabel: "Your Europe — EU residence rights",
      sourceHref: "https://europa.eu/youreurope/citizens/residence/residence-rights/index_en.htm",
      checkedOn: "2026-08-14",
    };
  }

  const source = entrySourcesByCountry[destinationCountry];
  return {
    status: "not-verified",
    visaAnswer: "Not yet verified by Morrovia",
    permittedStay: "Check the official source",
    detail: "We do not have a reviewed passport-specific summary for this combination yet.",
    conditions: ["Entry rules can also depend on residence, travel purpose and transit route."],
    sourceLabel: source?.label ?? "Official destination authority",
    sourceHref: source?.href ?? "https://www.gov.uk/foreign-travel-advice",
    checkedOn: "",
  };
};
