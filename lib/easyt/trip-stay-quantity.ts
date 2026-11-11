/** A quantity bound to this exact source occurrence, never a geographic guess. */
export function tripStayQuantityAt(prompt: string, start: number, end: number, options: { allowPrefix: boolean; allowBareNumber: boolean }) {
  const suffix = prompt.slice(end);
  const after = /^\s*[:—-]?\s*(\d{1,3})\s*(?:nights?\b|n\b)/i.exec(suffix)
    ?? (options.allowBareNumber ? /^\s*[:—-]?\s*(\d{1,3})(?=\s*(?:[,;.:→]|->|\band\b|\bthen\b|$))/i.exec(suffix) : null);
  if (after) return { nights: Number(after[1]), quantityStart: end + after[0].indexOf(after[1]), negated: false, sourceText: prompt.slice(start, end) + after[0] };
  // A country-level "12 nights in Italy" remains a whole-trip budget. Callers
  // enable this form only for an independently recognised overnight destination.
  const before = options.allowPrefix ? /\b(\d{1,3})\s*(?:nights?\b|n\b)\s+(?:in|at)\s*$/i.exec(prompt.slice(0, start)) : null;
  if (!before) return undefined;
  // "4 nights in Rome and/or Florence" does not allocate four to Rome alone.
  if (/^\s+(?:and|or)\s+(?!\d{1,3}\s*(?:nights?\b|n\b))/i.test(suffix)) return undefined;
  const prefix = prompt.slice(0,before.index);
  const negated = /\b(?:do\s+not|don't|dont|never|not|avoid|without)\s+(?:spend(?:ing)?|stay(?:ing)?)\s*$|\b(?:not|never|avoid|without)\s*$/i.test(prefix);
  return { nights: Number(before[1]), quantityStart: before.index, negated, sourceText: before[0] + prompt.slice(start, end) };
}
