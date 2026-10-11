import type { BuilderAcceptedEdit } from './trip-builder-edit.ts';

/** One feedback classification for all accepted canonical structural handlers. */
export function builderStructuralFeedback(edits: readonly BuilderAcceptedEdit[]) {
  const structural = edits.find(edit => edit.kind === 'dates') ?? edits.find(edit =>
    ['nights', 'order', 'add-destination', 'resolve-destination', 'replace-destination', 'remove-destination', 'planning-selection'].includes(edit.kind) || edit.kind === 'planning-area' && edit.action === 'remove');
  if (!structural) return null;
  const summary = structural.kind === 'dates' ? 'change_trip_dates'
    : structural.kind === 'nights' ? 'change_nights'
    : structural.kind === 'order' ? (structural.source === 'route-check' ? 'apply_route_order' : 'reorder_stop')
    : structural.kind === 'remove-destination' ? 'remove_destination'
    : structural.kind === 'planning-area' ? 'remove_requested_place'
    : structural.kind === 'planning-selection' ? (structural.selection.kind === 'visit' ? 'confirm_attraction_visit_base' : 'select_regional_base')
    : 'add_stop';
  return { summary };
}
