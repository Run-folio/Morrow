/** Server-owned presentation choice; explicit false retains the original homepage. */
export function immersiveHomepageEnabled(value: string | undefined) {
  return value === undefined || value === "true";
}
