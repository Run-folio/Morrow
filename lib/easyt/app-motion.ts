/** One reveal per opening, not per result/content revision. */
export function createRevealGate() {
  let revealed = false;
  return (open: boolean, ready: boolean) => {
    if (!open) { revealed = false; return false; }
    if (!ready || revealed) return false;
    revealed = true;
    return true;
  };
}
export function canSpring({reduced = false, disabled = false, excluded = false}: {reduced?: boolean; disabled?: boolean; excluded?: boolean}) {
  return !reduced && !disabled && !excluded;
}
