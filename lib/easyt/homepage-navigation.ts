export function nextHomepageRoute(index: number, direction: number, count: number) {
  return count > 0 ? ((index + direction) % count + count) % count : 0;
}
export function routeScrollCorrection(beforeTop: number, afterTop: number) {
  const delta = afterTop - beforeTop;
  return Number.isFinite(delta) && Math.abs(delta) > 1 ? delta : 0;
}
