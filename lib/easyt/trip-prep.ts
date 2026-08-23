import { accommodationProgress, stayBookingForStop } from "./accommodation.ts";
import type { BookingReadinessAction } from "./booking-readiness.ts";
import type { EasyTTrip, TripChecklistItem } from "./trip.ts";
import type { ReadinessCard, TravelReadinessProfile } from "./travel-readiness.ts";

export type TripPrepTaskStatus = "complete" | "in-progress" | "to-do" | "urgent";
export type TripPrepTaskCategory = "must" | "good" | "nice";
export type TripPrepTaskKind = "passport" | "accommodation" | "flight" | "insurance" | "connectivity" | "transport" | "activity" | "checklist";

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
    stopId?: string;
    opensDetails?: boolean;
  };
};

const lower = (value: string) => value.toLocaleLowerCase();

function matchingChecklist(checklist: TripChecklistItem[], pattern: RegExp) {
  return checklist.find((item) => pattern.test(`${item.id} ${item.label}`));
}

function checklistStatus(item: TripChecklistItem | undefined): TripPrepTaskStatus | undefined {
  return item ? (item.complete ? "complete" : "to-do") : undefined;
}

function daysUntil(startDate: string, now: Date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
  const start = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  return Math.ceil((start.getTime() - now.getTime()) / 86_400_000);
}

export function tripDepartureCountdown(startDate: string, now = new Date()) {
  const days = daysUntil(startDate, now);
  if (days === null) return { days: null, label: "Add dates to see your departure countdown." };
  if (days < 0) return { days, label: "This trip has started." };
  if (days === 0) return { days, label: "Departure is today." };
  if (days === 1) return { days, label: "1 day to go" };
  return { days, label: `${days} days to go` };
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
      stopId: action.stopId,
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
  const departure = daysUntil(trip.startDate, now);

  const passportChecklist = matchingChecklist(checklist, /passport|visa|entry/i);
  if (passportChecklist) consumedChecklist.add(passportChecklist.id);
  const travellerBasicsReady = Boolean(profile.nationalities.length && profile.residenceCountry);
  const passportReady = Boolean(travellerBasicsReady && profile.passportExpiryMonth);
  const passportStatus = checklistStatus(passportChecklist)
    ?? (passportReady ? "complete" : travellerBasicsReady ? "in-progress" : departure !== null && departure <= 30 ? "urgent" : "to-do");
  tasks.push({
    id: "traveller-passport",
    title: "Passport and traveller details",
    detail: passportReady
      ? "Traveller context is saved; verify destination rules with the official sources before booking."
      : travellerBasicsReady
        ? "Add a passport expiry month to make the existing validity reminder more useful."
        : "Add nationality and residence for a more useful entry-check starting point.",
    category: "must",
    status: passportStatus,
    kind: "passport",
    action: { label: "Review details", opensDetails: true },
  });

  const stays = accommodationProgress(trip);
  if (stays.stops.length) {
    const accommodationChecklist = matchingChecklist(checklist, /accommodation|hotel|stay/i);
    if (accommodationChecklist) consumedChecklist.add(accommodationChecklist.id);
    const firstMissing = stays.stops.find((stop) => !stayBookingForStop(trip, stop));
    tasks.push({
      id: "accommodation",
      title: "Accommodation",
      detail: `${stays.sortedCount} of ${stays.stops.length} overnight ${stays.stops.length === 1 ? "stop" : "stops"} sorted.`,
      category: "must",
      status: stays.complete ? "complete" : stays.sortedCount ? "in-progress" : "to-do",
      kind: "accommodation",
      action: firstMissing ? {
        label: "Find stays",
        href: `/journey/plan?trip=${encodeURIComponent(trip.id)}&stay=${encodeURIComponent(firstMissing.id)}`,
        stopId: firstMissing.id,
      } : undefined,
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
      action: insurance.href && insurance.cta ? { label: insurance.cta, href: insurance.href, external: true, affiliate: Boolean(insurance.partner), provider: insurance.partner } : { label: "Review guidance", opensDetails: true },
    });
  }

  const actionPatterns: Partial<Record<BookingReadinessAction["category"], RegExp>> = {
    flight: /flight/i,
    activity: /activit/i,
    connectivity: /esim|data|connect/i,
    "car-rental": /transport|transfer|car|drive/i,
    "ground-transport": /transport|transfer|train|ferry/i,
  };
  bookingActions.filter((action) => action.category !== "accommodation").forEach((action) => {
    const pattern = actionPatterns[action.category];
    const item = pattern ? matchingChecklist(checklist, pattern) : undefined;
    if (item) consumedChecklist.add(item.id);
    tasks.push(bookingTask(action, checklistStatus(item) ?? "to-do"));
  });

  const driving = readinessById.get("driving");
  if (driving && !tasks.some((task) => task.kind === "transport")) tasks.push({
    id: "driving-readiness",
    title: driving.title,
    detail: driving.detail,
    category: "good",
    status: "to-do",
    kind: "transport",
    action: { label: "Review guidance", opensDetails: true },
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

export function tripPrepProgress(tasks: TripPrepTask[]) {
  const complete = tasks.filter((task) => task.status === "complete").length;
  const inProgress = tasks.filter((task) => task.status === "in-progress").length;
  const toDo = tasks.length - complete - inProgress;
  return {
    complete,
    inProgress,
    toDo,
    total: tasks.length,
    percent: tasks.length ? Math.round((complete / tasks.length) * 100) : 100,
  };
}

export function nextTripPrepTask(tasks: TripPrepTask[]) {
  const rank = (task: TripPrepTask) => {
    if (task.status === "urgent") return 0;
    const category = task.category === "must" ? 0 : task.category === "good" ? 100 : 200;
    const essentialKind = task.kind === "passport" ? 10
      : task.kind === "accommodation" ? 20
        : task.kind === "insurance" ? 30
          : task.kind === "flight" ? 40
            : 50;
    const state = task.status === "in-progress" ? 0 : 1;
    return category + essentialKind + state;
  };
  return tasks.filter((task) => task.status !== "complete").sort((a, b) => rank(a) - rank(b))[0] ?? null;
}
