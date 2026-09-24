import type { ImmersiveRoute } from "./immersive-homepage-routes.ts";

export type HomepageDemoState = { nights: Record<string, number[]>; selected: Record<string, number>; day: Record<string, number>; view: "builder" | "itinerary" };
export type HomepageDemoAction = { type: "view"; view: HomepageDemoState["view"] } | { type: "select"; route: ImmersiveRoute; index: number } | { type: "day"; route: ImmersiveRoute; day: number } | { type: "night"; route: ImmersiveRoute; index: number; value: number } | { type: "reset"; route: ImmersiveRoute };
export function createHomepageDemo(routes: readonly ImmersiveRoute[]): HomepageDemoState {
  return { nights: Object.fromEntries(routes.map((route) => [route.key, route.stops.map((stop) => stop.nights)])), selected: {}, day: {}, view: "builder" };
}
/** This reducer has no persistence, account, analytics or network dependencies. */
export function homepageDemoReducer(state: HomepageDemoState, action: HomepageDemoAction): HomepageDemoState {
  if (action.type === "view") return { ...state, view: action.view };
  const { route } = action;
  if (action.type === "reset") return { ...state, nights: { ...state.nights, [route.key]: route.stops.map((stop) => stop.nights) }, selected: { ...state.selected, [route.key]: 0 }, day: { ...state.day, [route.key]: 1 } };
  const currentNights = state.nights[route.key] ?? route.stops.map((stop) => stop.nights);
  if (action.type === "day") {
    const totalDays = currentNights.reduce((sum, nights) => sum + nights, 1);
    if (!Number.isInteger(action.day) || action.day < 1 || action.day > totalDays) return state;
    return { ...state, day: { ...state.day, [route.key]: action.day }, selected: { ...state.selected, [route.key]: homepageDemoStopForDay(currentNights, action.day) } };
  }
  if (!Number.isInteger(action.index) || !route.stops[action.index]) return state;
  if (action.type === "select") return { ...state, selected: { ...state.selected, [route.key]: action.index }, day: { ...state.day, [route.key]: homepageDemoDay(currentNights, action.index) } };
  if (!Number.isFinite(action.value)) return state;
  const value = Math.min(28, Math.max(route.minimumNights[action.index], Math.round(action.value)));
  const nights = [...currentNights];
  while (nights[action.index] !== value) {
    const direction = value > nights[action.index] ? 1 : -1;
    const partner = route.stops.map((_, index) => index)
      .filter((index) => index !== action.index && (direction > 0 ? nights[index] > route.minimumNights[index] : nights[index] < 28))
      .sort((a, b) => Math.abs(a - action.index) - Math.abs(b - action.index) || a - b)[0];
    if (partner === undefined) break;
    nights[action.index] += direction;
    nights[partner] -= direction;
  }
  if (nights.every((night, index) => night === currentNights[index])) return state;
  return { ...state, nights: { ...state.nights, [route.key]: nights }, selected: { ...state.selected, [route.key]: action.index }, day: { ...state.day, [route.key]: homepageDemoDay(nights, action.index) } };
}
export function homepageDemoCanAdjustNight(route: ImmersiveRoute, nights: readonly number[], index: number, direction: -1 | 1) {
  if (!route.stops[index] || (direction < 0 ? nights[index] <= route.minimumNights[index] : nights[index] >= 28)) return false;
  return nights.some((value, other) => other !== index && (direction > 0 ? value > route.minimumNights[other] : value < 28));
}
export function homepageDemoDay(nights: readonly number[], index: number) {
  return nights.slice(0, index).reduce((total, night) => total + night, 1);
}
export function homepageDemoStopForDay(nights: readonly number[], day: number) {
  const index = nights.findIndex((_, stopIndex) => day < homepageDemoDay(nights, stopIndex) + nights[stopIndex]);
  return index < 0 ? Math.max(0, nights.length - 1) : index;
}

const sampleStartDates: Record<string, string> = {
  "japan-south-korea": "2027-10-01",
  "iceland-ring-road": "2027-07-01",
  "balkans-overland": "2027-05-15",
  "vietnam-cambodia": "2027-11-01",
  "namibia-self-drive": "2027-08-01",
  "peru-bolivia": "2027-06-01",
  "mexico-guatemala": "2027-11-01",
};
/** Fixed local sample dates; published routes themselves do not prescribe travel dates. */
export function homepageDemoDate(routeKey: string, day: number) {
  const start = new Date(`${sampleStartDates[routeKey] ?? "2027-06-01"}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + day - 1);
  return start.toISOString().slice(0, 10);
}
