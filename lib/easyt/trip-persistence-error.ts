export type TripPersistenceFailureCategory =
  | "authentication"
  | "conflict"
  | "validation"
  | "repository"
  | "network"
  | "unknown";

export type TripPersistenceOperation = "promotion" | "update";

export class EasyTTripPersistenceError extends Error {
  readonly category: TripPersistenceFailureCategory;
  readonly status: number;
  readonly operation: TripPersistenceOperation;

  constructor(input: {
    message: string;
    category: TripPersistenceFailureCategory;
    status: number;
    operation: TripPersistenceOperation;
  }) {
    super(input.message);
    this.name = "EasyTTripPersistenceError";
    this.category = input.category;
    this.status = input.status;
    this.operation = input.operation;
  }
}

export function tripPersistenceFailureCategory(
  status: number,
  serverCategory?: unknown,
): TripPersistenceFailureCategory {
  if (serverCategory === "authentication"
    || serverCategory === "conflict"
    || serverCategory === "validation"
    || serverCategory === "repository"
    || serverCategory === "network"
    || serverCategory === "unknown") return serverCategory;
  if (status === 401 || status === 403) return "authentication";
  if (status === 409) return "conflict";
  if (status === 400 || status === 413 || status === 422) return "validation";
  if (status >= 500) return "repository";
  return "unknown";
}

export function isTripPersistenceAuthenticationError(error: unknown) {
  return error instanceof EasyTTripPersistenceError && error.category === "authentication";
}

export function tripRecoveryStateForPersistenceError(error: unknown):
  "auth" | "conflict" | "validation" | "repository" | "network" | "unknown" {
  if (error instanceof EasyTTripPersistenceError) {
    if (error.category === "authentication") return "auth";
    if (error.category === "conflict") return "conflict";
    if (error.category === "validation") return "validation";
    if (error.category === "repository") return "repository";
    if (error.category === "network") return "network";
    return "unknown";
  }
  if (error instanceof TypeError) return "network" as const;
  if (error instanceof Error && error.name === "EasyTTripAuthError") return "auth";
  if (error instanceof Error && (error.name === "EasyTTripPromotionConflictError" || error.name === "EasyTTripSaveConflictError")) return "conflict" as const;
  return "unknown" as const;
}

/** Traveller-safe HTTP classification; raw provider/database errors stay in server logs. */
export function safeTripPersistenceFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  if (message === "Unauthorized") {
    return { status: 401, category: "authentication" as const, error: "Authentication required." };
  }
  if (message === "Trip ownership mismatch.") {
    return { status: 403, category: "authentication" as const, error: "This trip is not available to the current account." };
  }
  if (message === "Trip not found.") {
    return { status: 404, category: "unknown" as const, error: "The account trip could not be found." };
  }
  return { status: 500, category: "repository" as const, error: "Morrovia could not save this trip right now." };
}
