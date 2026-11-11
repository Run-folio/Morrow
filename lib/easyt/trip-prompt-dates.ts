type PromptDate = { value: string; sourceText: string };
const monthNames = 'Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?';
const dateToken = `(?:20\\d{2}-\\d{1,2}-\\d{1,2}|\\d{1,2}(?:st|nd|rd|th)?\\s+(?:${monthNames})\\s+20\\d{2}|(?:${monthNames})\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+20\\d{2})`;
const months = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const uncertainDateSuffix = (value: string) => /^\s*(?:,\s*)?(?:or|perhaps|maybe|possibly|probably|tentatively)\b/i.test(value);

function calendarDate(source: string) {
  const iso = /^(20\d{2})-(\d{1,2})-(\d{1,2})$/.exec(source);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\s+(20\d{2})$/i.exec(source);
  const monthFirst = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})$/i.exec(source);
  const year = Number(iso?.[1] ?? dayFirst?.[3] ?? monthFirst?.[3]);
  const month = iso ? Number(iso[2]) : months.indexOf((dayFirst?.[2] ?? monthFirst?.[1] ?? '').slice(0,3).toLowerCase()) + 1;
  const day = Number(iso?.[3] ?? dayFirst?.[1] ?? monthFirst?.[2]);
  const value = new Date(Date.UTC(year,month-1,day));
  if (value.getUTCFullYear()!==year || value.getUTCMonth()!==month-1 || value.getUTCDate()!==day) return undefined;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/** Only explicit calendar years and route-boundary/range syntax; never guess a
 * year from the clock, resolve numeric locale ambiguity, or use activity dates. */
export function tripPromptDates(prompt: string): { start?: PromptDate; end?: PromptDate; invalid: boolean } {
  const starts: PromptDate[] = [], ends: PromptDate[] = [];
  let invalid = false;
  const add = (items: PromptDate[], sourceText: string, expanded = sourceText) => {
    const value = calendarDate(expanded);
    if (!value) { invalid=true; return; }
    items.push({value,sourceText});
  };
  for (const match of prompt.matchAll(new RegExp(`\\b(start(?:ing)?|begin(?:ning)?|arriv(?:e|ing)|depart(?:ing)?|finish(?:ing)?|end(?:ing)?|return(?:ing)?)\\b[^,.!?;\\n]*?\\bon\\s+(${dateToken})\\b`, 'gi'))) {
    // Refused or tentative boundary instructions do not establish fixed dates.
    const before = prompt.slice(0,match.index).split(/[.!?;\n]/).at(-1) ?? '';
    const instruction = match[0].slice(0,-match[2].length);
    if (!/^[a-z]+(?:\s+the\s+(?:trip|journey))?\s+(?:in|at|from|home|on)\b/i.test(instruction)) continue;
    if (/\b(?:visit|visiting|see|seeing|explore|exploring|attend|attending|spend|spending)\b/i.test(instruction)) continue;
    if (/\b(?:not|never|don['’]t|might|maybe|perhaps|possibly|could)\b/i.test(before + instruction) || /\bmay\s*$/i.test(before)) continue;
    const suffix = prompt.slice(match.index! + match[0].length);
    if (uncertainDateSuffix(suffix)) { invalid=true; continue; }
    add(/^(?:finish|end|return)/i.test(match[1])?ends:starts,match[2]);
  }
  // A labelled trip-date range may share one named month/year. Requiring the
  // trip/travel label avoids promoting activity or booking dates into trip dates.
  const rangePrefix = '(?:^|[,.;\\n])\\s*(?:trip|travel)\\s+dates?\\s*:\\s*';
  for (const match of prompt.matchAll(new RegExp(`${rangePrefix}(${dateToken})\\s*(?:to|until|[–—-])\\s*(${dateToken})(?=\\s*(?:[.,;]|$))`, 'gi'))) {
    if (uncertainDateSuffix(prompt.slice(match.index! + match[0].length))) { invalid=true; continue; }
    add(starts,match[1]);add(ends,match[2]);
  }
  for (const match of prompt.matchAll(new RegExp(`${rangePrefix}(\\d{1,2})(?:st|nd|rd|th)?\\s*[–—-]\\s*(\\d{1,2})(?:st|nd|rd|th)?\\s+(${monthNames})\\s+(20\\d{2})(?=\\s*(?:[.,;]|$))`, 'gi'))) {
    if (uncertainDateSuffix(prompt.slice(match.index! + match[0].length))) { invalid=true; continue; }
    add(starts,match[0].trim(),`${match[1]} ${match[3]} ${match[4]}`);
    add(ends,match[0].trim(),`${match[2]} ${match[3]} ${match[4]}`);
  }
  if (new Set(starts.map(date=>date.value)).size>1 || new Set(ends.map(date=>date.value)).size>1) invalid=true;
  return invalid ? {invalid:true} : {start:starts[0],end:ends[0],invalid:false};
}
