import type { ComposedItineraryTonight } from "./itinerary-day-composition.ts";

export type ItineraryStayPresentation = {
  state: "booked" | "selected" | "missing" | "unknown";
  title: string;
  detail: string;
};

/** Truthful, quiet stay copy derived from the canonical overnight composition. */
export function itineraryStayPresentation(tonight: ComposedItineraryTonight): ItineraryStayPresentation | null {
  if (tonight.state === "no-overnight") return null;
  if (tonight.booking) {
    const confirmed = Boolean(tonight.booking.confirmation?.trim());
    return {
      state: confirmed ? "booked" : "selected",
      title: tonight.booking.title,
      detail: confirmed
        ? `Booked${tonight.destination ? ` · ${tonight.destination}` : ""}`
        : "Selected · not booked",
    };
  }
  if (tonight.state === "not-organised") {
    return {
      state: "missing",
      title: tonight.destination ?? "Stay",
      detail: "No stay organised",
    };
  }
  return {
    state: "unknown",
    title: tonight.destination ?? "Stay",
    detail: "Stay details to confirm",
  };
}
