/**
 * Canonical owner for Morrovia's verified public business identity.
 *
 * Keep unknown registration details as null. Public surfaces must omit null
 * values rather than inventing placeholders or duplicating company facts.
 */
export const morroviaLegalIdentity = {
  productName: "Morrovia",
  legalOperator: "Shaun Whiting Limited",
  tradingName: "Morrovia",
  registrationJurisdiction: null,
  companyNumber: null,
  registeredOffice: null,
  supportContact: "sw@shaunwhiting.com",
  privacyContact: "sw@shaunwhiting.com",
  copyrightYear: 2026,
} as const;

export type MorroviaLegalIdentity = typeof morroviaLegalIdentity;
