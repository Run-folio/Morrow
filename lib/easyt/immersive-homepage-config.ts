/** Server-owned presentation choice. Missing or misspelled values fail closed. */
export function immersiveHomepageEnabled(value: string | undefined) {
  return value === "true";
}
