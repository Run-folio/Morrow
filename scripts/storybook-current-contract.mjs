/** Refuse silent empty/partial qualification after a typo or scope filter. */
export function requireStorySelection(cases, entries, { ids, memoryOnly = false } = {}) {
  const eligible = memoryOnly ? cases.filter(item => /builder-recovery-boundaries\.stories|privacy-consent\.stories|trip-shell\.stories|trip-stay-workspace\.stories/.test(item.importPath) || item.id.endsWith('--trip-navigation')) : cases;
  const requested = ids ? String(ids).split(',').map(value => value.trim()) : null;
  if (requested) for (const id of requested) {
    if (!entries.some(entry => entry.id === id)) throw new Error(`Unknown Storybook ID: ${id}`);
    if (!eligible.some(entry => entry.id === id)) throw new Error(`Story ${id} is outside this qualification matrix`);
  }
  const selected = requested ? eligible.filter(entry => requested.includes(entry.id)) : eligible;
  if (!selected.length) throw new Error('No stories selected for qualification');
  return selected;
}

/** Explore's catalogue intentionally renders its component without shell chrome. */
export function requireWorkspaceNavigation(surface, width, state) {
  if (surface === 'explore' && !state.count) return;
  if (!state.count) throw new Error(`Missing ${surface} workspace navigation landmark`);
  const label = ({ overview: 'Overview', itinerary: 'Itinerary', transport: 'Transport', explore: 'Explore', stay: 'Stays' })[surface];
  if (width <= 700 && ['Explore', 'Stays'].includes(label)) {
    if (state.more !== `More, current section: ${label}`) throw new Error(`Missing current ${label} More affordance`);
  } else {
    const expected = label === 'Stays' ? 'Stay' : label;
    if (state.current !== expected) throw new Error(`Workspace navigation is not current: expected ${expected}, got ${state.current}`);
  }
}
