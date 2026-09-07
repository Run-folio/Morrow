import type { ImmersiveRoute } from "./immersive-homepage-routes.ts";

export type HomepageDemoState = { nights: Record<string, number[]>; selected: Record<string, number>; view: "map" | "builder" | "itinerary" };
export type HomepageDemoAction = { type: "view"; view: HomepageDemoState["view"] } | { type: "select"; route: ImmersiveRoute; index: number } | { type: "night"; route: ImmersiveRoute; index: number; value: number } | { type: "reset"; route: ImmersiveRoute };
export function createHomepageDemo(routes: readonly ImmersiveRoute[]): HomepageDemoState {
  return { nights: Object.fromEntries(routes.map((route) => [route.key, route.stops.map((stop) => stop.nights)])), selected: {}, view: "map" };
}
/** This reducer has no persistence, account, analytics or network dependencies. */
export function homepageDemoReducer(state: HomepageDemoState, action: HomepageDemoAction): HomepageDemoState {
  if (action.type === "view") return { ...state, view: action.view };
  const { route } = action;
  if (action.type === "reset") return { ...state, nights: { ...state.nights, [route.key]: route.stops.map((stop) => stop.nights) }, selected: { ...state.selected, [route.key]: 0 } };
  if (!Number.isInteger(action.index) || !route.stops[action.index]) return state;
  if (action.type === "select") return { ...state, selected: { ...state.selected, [route.key]: action.index } };
  if (!Number.isFinite(action.value)) return state;
  const value = Math.min(28, Math.max(route.minimumNights[action.index], Math.round(action.value)));
  const nights = (state.nights[route.key] ?? route.stops.map((stop) => stop.nights)).map((night, index) => index === action.index ? value : night);
  return { ...state, nights: { ...state.nights, [route.key]: nights }, selected: { ...state.selected, [route.key]: action.index } };
}
export function homepageDemoDay(nights: readonly number[], index: number) {
  return nights.slice(0, index).reduce((total, night) => total + night, 1);
}
