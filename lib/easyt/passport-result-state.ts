import type { TouristEntryRequirement, VisaLanguage } from "./visa-requirements.ts";

export type PassportCheckQuery = {
  nationality: string;
  destination: string;
  language: VisaLanguage;
};

export type PassportCheckResult = PassportCheckQuery & { requirement: TouristEntryRequirement };

export type PassportResultState =
  | { status: "idle"; requestId: number; result: null }
  | { status: "loading"; requestId: number; result: null }
  | { status: "ready"; requestId: number; result: PassportCheckResult }
  | { status: "failed"; requestId: number; result: null };

export const emptyPassportResult = (requestId = 0): PassportResultState => ({ status: "idle", requestId, result: null });

/** A selection change invalidates all previous entry guidance before another check can render. */
export const invalidatePassportResult = (state: PassportResultState, requestId = state.requestId + 1): PassportResultState => emptyPassportResult(requestId);

export const beginPassportCheck = (state: PassportResultState, requestId = state.requestId + 1): PassportResultState => ({ status: "loading", requestId, result: null });

/** Ignore late responses from an earlier nationality, destination, or language selection. */
export const resolvePassportCheck = (state: PassportResultState, requestId: number, result: PassportCheckResult): PassportResultState =>
  state.status === "loading" && state.requestId === requestId ? { status: "ready", requestId, result } : state;

export const failPassportCheck = (state: PassportResultState, requestId: number): PassportResultState =>
  state.status === "loading" && state.requestId === requestId ? { status: "failed", requestId, result: null } : state;
