import type { EasyTTrip, PlanItem } from "./trip.ts";

/** Exact older Builder shape: place identities, generated descriptions, then a known guidance sentence. */
export function legacyGeneratedDayContext(day: Pick<PlanItem, "notes"> & Partial<Pick<PlanItem, "type" | "title" | "reason" | "contextNotes">>) {
  const empty = { notes: [] as string[], sourceIndexes: new Set<number>() };
  if (day.type !== "activity" || day.contextNotes?.length || !day.title || !day.reason) return empty;
  const grouped = day.title.endsWith(" + nearby time") && day.reason.startsWith("These two selected places are planned as one focused day");
  const single = day.reason.startsWith("Built around ") || day.reason.startsWith("A flexible day built around a real nearby option");
  if (!grouped && !single) return empty;
  const identityCount = grouped ? 2 : 1;
  const guidance = new Set([
    "Check opening hours and timed-entry requirements before booking.",
    "Leave the final part of the day open for a local meal or a nearby walk.",
    "Keep the rest of the day in the same area.",
  ]);
  const guidanceIndex = day.notes.findIndex((note, index) => index > identityCount && guidance.has(note));
  if (guidanceIndex !== identityCount * 2 || day.notes.slice(0, identityCount).some((note) => !note.trim())) return empty;
  const sourceIndexes = new Set(Array.from({ length: guidanceIndex - identityCount + 1 }, (_, index) => identityCount + index));
  return { notes: day.notes.slice(identityCount, guidanceIndex + 1), sourceIndexes };
}

/** Read older documents without promoting generated prose to canonical activities. Saved bytes stay copy-first until the next write. */
export function normalizeLegacyGeneratedDayContext(trip: EasyTTrip): EasyTTrip {
  let changed = false;
  const planItems = trip.planItems.map((day) => {
    const generated = legacyGeneratedDayContext(day);
    if (!generated.notes.length) return day;
    changed = true;
    return {
      ...day,
      notes: day.notes.filter((_, index) => !generated.sourceIndexes.has(index)),
      ...(day.noteDayParts ? { noteDayParts: day.noteDayParts.filter((_, index) => !generated.sourceIndexes.has(index)) } : {}),
      contextNotes: [...(day.contextNotes ?? []), ...generated.notes],
    };
  });
  return changed ? { ...trip, planItems } : trip;
}
