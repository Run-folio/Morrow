import type { ImmersiveRoute } from "./immersive-homepage-routes.ts";
import { homepageDemoDate, homepageDemoDay, homepageDemoStopForDay } from "./homepage-demo.ts";

export type HomepageDemoIdea = {
  id: string;
  stopId: string;
  part: "morning" | "midday" | "afternoon" | "evening";
  en: string;
  es: string;
  status: "suggested";
};
export type HomepageDemoItineraryDay = {
  number: number;
  date: string;
  stopId: string;
  stopIndex: number;
  overnight: boolean;
  transfer: { fromStopId: string; from: string; to: string } | null;
  items: HomepageDemoIdea[];
};
export type HomepageDemoItinerary = {
  route: ImmersiveRoute;
  nights: readonly number[];
  days: HomepageDemoItineraryDay[];
  disclosure: { en: string; es: string };
};
export type HomepageDemoWeek = {
  id: string;
  days: Array<HomepageDemoItineraryDay | null>;
  bands: Array<{ stopId: string; stopIndex: number; start: number; span: number; continued: boolean }>;
};

// Reviewed route-family stay guidance in featured-route-families.ts. These are
// planning themes, not attraction, availability or booking claims.
const reviewedLeadIdeas: Record<string, Record<string, { en: string; es: string }>> = {
  "namibia-self-drive": {
    Sossusvlei: { en: "Leave room for an early landscape start", es: "Deja tiempo para comenzar temprano entre paisajes" },
    Swakopmund: { en: "Take a pause by the Atlantic coast", es: "Haz una pausa junto a la costa atlántica" },
    Damaraland: { en: "Keep a flexible landscape day", es: "Deja un día flexible para los paisajes" },
    Etosha: { en: "Leave time to look for wildlife in Etosha", es: "Deja tiempo para buscar fauna en Etosha" },
    Waterberg: { en: "Take time for the Waterberg landscape", es: "Dedica tiempo al paisaje de Waterberg" },
  },
};

/** A local presentation of published route stops. Every idea is a suggestion,
 * anchored to the stop occurrence ID; no reservation or timetable is implied. */
export function homepageDemoItinerary(route: ImmersiveRoute, nights: readonly number[]): HomepageDemoItinerary {
  const totalDays = nights.reduce((sum, value) => sum + value, 1);
  const days = Array.from({ length: totalDays }, (_, offset): HomepageDemoItineraryDay => {
    const number = offset + 1;
    const stopIndex = homepageDemoStopForDay(nights, number);
    const stop = route.stops[stopIndex];
    const firstAtStop = number === homepageDemoDay(nights, stopIndex);
    const transfer = stopIndex > 0 && firstAtStop ? {
      fromStopId: route.stops[stopIndex - 1].id,
      from: route.stops[stopIndex - 1].name,
      to: stop.name,
    } : null;
    const idea = (part: HomepageDemoIdea["part"], kind: string, en: string, es: string): HomepageDemoIdea => ({
      id: `${stop.id}:${number - homepageDemoDay(nights, stopIndex)}:${kind}`,
      stopId: stop.id, part, en, es, status: "suggested",
    });
    const items = transfer
      ? [idea("evening", "unwind", `Unwind in ${stop.name}`, `Descansa en ${stop.name}`)]
      : number === totalDays
        ? [idea("morning", "flex", `Time at your own pace in ${stop.name}`, `Tiempo a tu ritmo en ${stop.name}`)]
        : [
          idea("morning", "explore", reviewedLeadIdeas[route.key]?.[stop.name]?.en ?? `Explore ${stop.name}`, reviewedLeadIdeas[route.key]?.[stop.name]?.es ?? `Explora ${stop.name}`),
          idea("afternoon", "flex", `Free time in ${stop.name}`, `Tiempo libre en ${stop.name}`),
          ...(number % 2 === 0 ? [idea("evening", "evening", "Evening at your own pace", "Noche a tu ritmo")] : []),
        ];
    return { number, date: homepageDemoDate(route.key, number), stopId: stop.id, stopIndex, overnight: number < totalDays, transfer, items };
  });
  return { route, nights, days, disclosure: { en: "Sample ideas. Activities and stays are not booked.", es: "Ideas de ejemplo. Actividades y alojamientos sin reservar." } };
}

/** Prefer a populated non-transfer day nearest the early middle of the trip. */
export function homepageDemoRepresentativeDay(itinerary: HomepageDemoItinerary): number {
  const target = itinerary.days.length * 0.4;
  return [...itinerary.days]
    .filter((day) => !day.transfer && day.items.length >= 2 && day.number > 1 && day.number < itinerary.days.length)
    .sort((a, b) => Math.abs(a.number - target) - Math.abs(b.number - target) || a.number - b.number)[0]?.number
    ?? itinerary.days.find((day) => day.items.length >= 2)?.number ?? 1;
}

/** Week and overnight layout mirrors the production Monday–Sunday Calendar. */
export function homepageDemoWeeks(itinerary: HomepageDemoItinerary): HomepageDemoWeek[] {
  const weeks: HomepageDemoWeek[] = [];
  for (const day of itinerary.days) {
    const date = new Date(`${day.date}T12:00:00Z`);
    const slot = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - slot);
    const id = date.toISOString().slice(0, 10);
    let week = weeks.find((entry) => entry.id === id);
    if (!week) { week = { id, days: Array(7).fill(null), bands: [] }; weeks.push(week); }
    week.days[slot] = day;
  }
  for (const week of weeks) {
    week.days.forEach((day, slot) => {
      if (!day?.overnight) return;
      const last = week.bands.at(-1);
      if (last?.stopId === day.stopId && last.start + last.span === slot) last.span++;
      else week.bands.push({ stopId: day.stopId, stopIndex: day.stopIndex, start: slot, span: 1, continued: day.number > homepageDemoDay(itinerary.nights, day.stopIndex) });
    });
  }
  return weeks;
}
