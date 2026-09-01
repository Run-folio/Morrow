import { accommodationDatesReady, accommodationProgress, stayBookingForStop } from "./accommodation.ts";
import type { BookingReadinessAction } from "./booking-readiness.ts";
import { tripIntentForTrip, type EasyTTrip, type TripChecklistItem } from "./trip.ts";
import { deriveTripDateFacts } from "./trip-facts.ts";
import type { ReadinessCard, TravelReadinessProfile } from "./travel-readiness.ts";
import { mapWorkspaceHref } from "./trip-workspace-links.ts";

export type TripPrepTaskStatus = "complete" | "in-progress" | "to-do" | "urgent";
export type TripPrepTaskCategory = "must" | "good" | "nice";
export type TripPrepTaskKind = "dates" | "passport" | "accommodation" | "flight" | "insurance" | "connectivity" | "transport" | "activity" | "checklist";

export type TripPrepTask = {
  id: string;
  title: string;
  detail: string;
  category: TripPrepTaskCategory;
  status: TripPrepTaskStatus;
  kind: TripPrepTaskKind;
  action?: {
    label: string;
    href?: string;
    external?: boolean;
    affiliate?: boolean;
    provider?: string;
    bookingCategory?: BookingReadinessAction["category"];
    affiliateCategory?: BookingReadinessAction["affiliateCategory"];
    stopId?: string;
    transferId?: string;
    originStopId?: string;
    destinationStopId?: string;
    opensTravellerDetails?: boolean;
  };
};

const lower = (value: string) => value.toLocaleLowerCase();

function matchingChecklist(checklist: TripChecklistItem[], pattern: RegExp) {
  return checklist.find((item) => pattern.test(`${item.id} ${item.label}`));
}

function checklistStatus(item: TripChecklistItem | undefined): TripPrepTaskStatus | undefined {
  return item ? (item.complete ? "complete" : "to-do") : undefined;
}

function categoryForChecklist(item: TripChecklistItem): TripPrepTaskCategory {
  const text = lower(`${item.id} ${item.label}`);
  if (/passport|visa|entry|insurance|flight|accommodation|hotel|stay/.test(text)) return "must";
  if (/transport|transfer|esim|data|health|money|payment|pack|activit/.test(text)) return "good";
  return "nice";
}

function kindForChecklist(item: TripChecklistItem): TripPrepTaskKind {
  const text = lower(`${item.id} ${item.label}`);
  if (/passport|visa|entry/.test(text)) return "passport";
  if (/insurance/.test(text)) return "insurance";
  if (/flight/.test(text)) return "flight";
  if (/accommodation|hotel|stay/.test(text)) return "accommodation";
  if (/esim|data|connect/.test(text)) return "connectivity";
  if (/transport|transfer|car|train/.test(text)) return "transport";
  if (/activit/.test(text)) return "activity";
  return "checklist";
}

function bookingTask(action: BookingReadinessAction, status: TripPrepTaskStatus): TripPrepTask {
  const mapping: Record<BookingReadinessAction["category"], Pick<TripPrepTask, "category" | "kind">> = {
    accommodation: { category: "must", kind: "accommodation" },
    flight: { category: "must", kind: "flight" },
    activity: { category: "good", kind: "activity" },
    "car-rental": { category: "good", kind: "transport" },
    connectivity: { category: "good", kind: "connectivity" },
    "ground-transport": { category: "good", kind: "transport" },
    transport: { category: "good", kind: "transport" },
  };
  return {
    id: action.id,
    title: action.title,
    detail: action.detail,
    status,
    ...mapping[action.category],
    action: {
      label: action.cta,
      href: action.href,
      external: true,
      affiliate: action.affiliate,
      provider: action.provider,
      bookingCategory: action.category,
      affiliateCategory: action.affiliateCategory,
      stopId: action.stopId,
      transferId: action.transferId,
      originStopId: action.originStopId,
      destinationStopId: action.destinationStopId,
    },
  };
}

export function deriveTripPrepTasks({
  trip,
  profile,
  bookingActions,
  readinessCards,
  now = new Date(),
}: {
  trip: EasyTTrip;
  profile: TravelReadinessProfile;
  bookingActions: BookingReadinessAction[];
  readinessCards: ReadinessCard[];
  now?: Date;
}): TripPrepTask[] {
  const tasks: TripPrepTask[] = [];
  const checklist = trip.brief.checklist ?? [];
  const consumedChecklist = new Set<string>();
  const dateFacts = deriveTripDateFacts(trip, now);
  const lifecycle = dateFacts.lifecycle;
  const datesReady = dateFacts.state === "valid";
  const avoidDriving = tripIntentForTrip(trip).hardConstraints.avoidDriving;

  if (!datesReady) tasks.push({
    id: "trip-dates",
    title: "Trip dates",
    detail: lifecycle.state === "invalid"
      ? "Review the start and end dates; they need to be valid and in order."
      : "Add both start and end dates before relying on time-sensitive travel guidance.",
    category: "must",
    status: "to-do",
    kind: "dates",
    action: { label: "Review dates", href: `/journey/new?trip=${encodeURIComponent(trip.id)}` },
  });

  const passportChecklist = matchingChecklist(checklist, /passport|visa|entry/i);
  if (passportChecklist) consumedChecklist.add(passportChecklist.id);
  const travellerBasicsReady = Boolean(profile.nationalities.length && profile.residenceCountry);
  const passportReady = Boolean(travellerBasicsReady && profile.passportExpiryMonth);
  const passportStatus = checklistStatus(passportChecklist)
    ?? (passportReady
      ? "complete"
      : travellerBasicsReady
        ? "in-progress"
        : (lifecycle.state === "upcoming" || lifecycle.state === "starts-today")
          && lifecycle.daysUntilStart !== null && lifecycle.daysUntilStart <= 30
          ? "urgent"
          : "to-do");
  tasks.push({
    id: "traveller-passport",
    title: passportChecklist?.label ?? "Passport and traveller details",
    detail: passportChecklist
      ? passportChecklist.complete
        ? "Marked complete on your saved trip checklist. Verify official entry rules before booking."
        : "Still on your saved trip checklist. Verify official entry rules before booking."
      : passportReady
        ? "Traveller context is saved; verify destination rules with the official sources before booking."
        : travellerBasicsReady
          ? "Add a passport expiry month to make the existing validity reminder more useful."
          : "Add nationality and residence for a more useful entry-check starting point.",
    category: "must",
    status: passportStatus,
    kind: "passport",
    action: { label: "Review traveller details", opensTravellerDetails: true },
  });

  const stays = accommodationProgress(trip);
  if (stays.stops.length) {
    const accommodationChecklist = matchingChecklist(checklist, /accommodation|hotel|stay/i);
    if (accommodationChecklist) consumedChecklist.add(accommodationChecklist.id);
    const firstDatesMissing = stays.stops.find((stop) => !accommodationDatesReady(stop, trip));
    const firstMissing = stays.stops.find((stop) => !stayBookingForStop(trip, stop));
    tasks.push({
      id: "accommodation",
      title: "Accommodation",
      detail: firstDatesMissing
        ? `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stop has" : "stops have"} a saved stay; confirm the missing stop dates.`
        : `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stop" : "stops"} sorted.`,
      category: "must",
      status: stays.complete ? "complete" : stays.sortedCount || stays.datesReadyCount ? "in-progress" : "to-do",
      kind: "accommodation",
      action: firstDatesMissing
        ? { label: "Review dates", href: `/journey/new?trip=${encodeURIComponent(trip.id)}` }
        : firstMissing
          ? {
            label: "Find stays",
            href: mapWorkspaceHref(trip.id, firstMissing.id, "stay"),
            stopId: firstMissing.id,
          }
          : undefined,
    });
  }

  const readinessById = new Map(readinessCards.map((card) => [card.id, card]));
  const insurance = readinessById.get("insurance");
  if (insurance) {
    const insuranceChecklist = matchingChecklist(checklist, /insurance/i);
    if (insuranceChecklist) consumedChecklist.add(insuranceChecklist.id);
    tasks.push({
      id: "travel-insurance",
      title: insurance.title,
      detail: insurance.detail,
      category: "must",
      status: checklistStatus(insuranceChecklist) ?? "to-do",
      kind: "insurance",
      ...(insurance.href && insurance.cta ? { action: { label: insurance.cta, href: insurance.href, external: true, affiliate: Boolean(insurance.partner), provider: insurance.partner } } : {}),
    });
  }

  const actionPatterns: Partial<Record<BookingReadinessAction["category"], RegExp>> = {
    flight: /flight/i,
    activity: /activit/i,
    connectivity: /esim|data|connect/i,
    "car-rental": /transport|transfer|car|drive/i,
    "ground-transport": /transport|transfer|train|ferry/i,
    transport: /transport|transfer|train|ferry|flight|bus|coach/i,
  };
  bookingActions.filter((action) => action.category !== "accommodation" && !(avoidDriving && action.category === "car-rental")).forEach((action) => {
    const pattern = actionPatterns[action.category];
    const item = pattern ? matchingChecklist(checklist, pattern) : undefined;
    if (item) consumedChecklist.add(item.id);
    tasks.push(bookingTask(action, checklistStatus(item) ?? "to-do"));
  });

  const driving = avoidDriving ? undefined : readinessById.get("driving");
  if (driving && !avoidDriving && !tasks.some((task) => task.kind === "transport")) tasks.push({
    id: "driving-readiness",
    title: driving.title,
    detail: driving.detail,
    category: "good",
    status: "to-do",
    kind: "transport",
  });

  checklist.filter((item) => !consumedChecklist.has(item.id)).forEach((item) => tasks.push({
    id: `checklist-${item.id}`,
    title: item.label,
    detail: item.complete ? "Saved as complete on this trip." : "Still on your saved trip checklist.",
    category: categoryForChecklist(item),
    status: item.complete ? "complete" : "to-do",
    kind: kindForChecklist(item),
  }));

  return tasks;
}

export function groupTripPrepTasks(tasks: TripPrepTask[]) {
  return {
    must: tasks.filter((task) => task.category === "must"),
    good: tasks.filter((task) => task.category === "good"),
    nice: tasks.filter((task) => task.category === "nice"),
  };
}
