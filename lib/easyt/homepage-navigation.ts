export function nextHomepageRoute(index: number, direction: number, count: number) {
  return count > 0 ? ((index + direction) % count + count) % count : 0;
}
export function routeScrollCorrection(beforeTop: number, afterTop: number) {
  const delta = afterTop - beforeTop;
  return Number.isFinite(delta) && Math.abs(delta) > 1 ? delta : 0;
}

/** Ignore effect replay and same-route selections; remount starts a fresh entry. */
export function homepageRouteView(previous: string | null, current: string) {
  return previous === current ? null : previous === null ? "initial" as const : "change" as const;
}

/** Editorial labels only; stops, nights and handoff data stay catalogue-owned. */
const journeyLabels: Record<string, { short: string; title: string; line: string; theme: string }> = {
  "japan-slow": { short: "Japan", title: "Japan,", line: "at your own pace.", theme: "Rail + pacing" },
  "balkans-overland": { short: "The Balkans", title: "The Balkans,", line: "one border at a time.", theme: "Borders + ground connections" },
  "vietnam-cambodia": { short: "Vietnam → Cambodia", title: "Vietnam to Angkor,", line: "without rushing.", theme: "Distance + mixed transfers" },
  "iceland-ring-road": { short: "Iceland", title: "Iceland’s Ring Road,", line: "slowly.", theme: "Driving + nightly pacing" },
};
export function homepageJourneyLabel(key: string, fallback: string) {
  return journeyLabels[key] ?? { short: fallback, title: fallback, line: "", theme: "" };
}
