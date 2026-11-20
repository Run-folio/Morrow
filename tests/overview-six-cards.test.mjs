import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync('components/easyt/'+name,'utf8');
const view=read('trip-overview-workspace.tsx'), prep=read('trip-preparation.tsx');
test('one responsive grid contains the planning and preparation cards in order',()=>{
 const grid=view.match(/<div className=\{styles.arrangeGrid\}>([\s\S]*?)<\/div>/)?.[1];
 assert.ok(grid && grid.indexOf('planningCategories.map')>=0 && grid.indexOf('<TripPreparationCards')>grid.indexOf('planningCategories.map'));
 assert.match(prep,/return <>\s*\{tasks.map/);
 assert.match(read('trip-overview-workspace.module.css'),/repeat\(2, minmax\(0, 1fr\)\)/);
});
test('transfer controls match leg IDs, support keyboard, and never substitute a random stop for an unknown leg',()=>{
 assert.match(view,/transferWarning\(step.leg\)/);assert.match(view,/transferWarning\(departureStep.leg\)/);
 assert.match(view,/reviewLegIds.includes\(leg.id\)/);assert.match(view,/unplacedTransfer/);
 const info=read('overview-info.tsx');for(const event of ['onFocus','Escape','onClick','onPointerEnter','aria-describedby'])assert.ok(info.includes(event));
 assert.match(prep,/\{!previewProvider && isSponsoredLink/);
});

test('the six-card grid uses the shared white surface for both card types and preserves the surface on hover', () => {
 const overview = read('trip-overview-workspace.module.css');
 assert.match(overview, /\.arrangeGrid\s*\{[^}]*--overview-card-surface:\s*var\(--morrovia-control-surface\)/);
 assert.match(overview, /\.arrangeItem\s*\{[^}]*background:\s*var\(--overview-card-surface\)/);
 assert.doesNotMatch(overview, /\.arrangeItemInteractive:hover\s*\{[^}]*background:/);
 assert.match(read('trip-preparation.module.css'), /\.overviewPrepCard\s*\{[^}]*background:\s*var\(--overview-card-surface, var\(--morrovia-paper\)\)/);
});
