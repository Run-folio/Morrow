const productName = "Morrovia";
const legalOperator = "Shaun Whiting Limited";

/**
 * Canonical owner for Morrovia's verified public business identity.
 *
 * Keep unknown registration details as null. Public surfaces must omit null
 * values rather than inventing placeholders or duplicating company facts.
 */
export const morroviaLegalIdentity = {
  productName,
  legalOperator,
  tradingName: productName,
  operatorTradingAs: `${legalOperator}, trading as ${productName}`,
  registrationJurisdiction: null,
  companyNumber: null,
  registeredOffice: null,
  copyrightYear: 2026,
} as const;

export type MorroviaLegalIdentity = typeof morroviaLegalIdentity;
