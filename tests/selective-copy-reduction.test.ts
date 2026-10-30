import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
const source=(path:string)=>readFileSync(path,"utf8");
test("expanded destination editor has one visible heading and retains accessible field/disclosure",()=>{
 const capture=source("components/easyt/morrovia-trip-capture.tsx");
 assert.match(capture,/destinationEditorOpen \? text.destinations/);
 assert.doesNotMatch(capture,/<small>\{text.editPlaces\}<\/small>/);
 assert.match(capture,/aria-expanded=\{destinationEditorOpen\}/);
 assert.match(source("components/easyt/morrovia-trip-capture.module.css"),/\.wideDestinationEditor \[data-morrovia-field-label\]/);
 assert.match(source("components/easyt/morrovia-destination-field.tsx"),/aria-label=\{label\}/);
});
test("Overview uses one Next steps heading and retains card counts/actions",()=>{
 const src=source("components/easyt/trip-overview-workspace.tsx");
 const section=src.slice(src.indexOf('aria-labelledby="overview-progress-title"'),src.indexOf('<TripExplicitPlans'));
 assert.match(section,/Next steps/);assert.doesNotMatch(section,/Next to arrange|Get the essentials in place/);
 assert.match(section,/detail=\{text.detail\}/);assert.match(section,/action=\{progressAction\(category\)\}/);
});
test("routine progress labels/visible percentages go while review and numeric accessibility remain",()=>{
 const src=source("components/easyt/trip-overview-workspace.tsx");
 assert.match(src,/status === "needs-review" \? <small/);
 assert.doesNotMatch(src,/<span>\{percent\}%<\/span>/);
 assert.match(src,/role="progressbar" aria-label=\{label\} aria-valuenow=\{percent\} aria-valuemin=\{0\} aria-valuemax=\{100\}/);
 assert.match(src,/Progress to confirm/);
});
test("Transport suppresses only duplicated uncertainty and keeps booking facts",()=>{
 const src=source("components/easyt/trip-transport-workspace.tsx");
 assert.match(src,/showStatus = !\(status === copy.planningEstimate && showsEstimatedTiming\)/);
 assert.match(src,/status === copy.needsCheckingStatus && leg.mode === "unknown" && durationMinutes === null/);
 assert.match(src,/notBooked: "Not booked"/);assert.match(src,/booked: "Booked"/);
 assert.match(src,/TransportAffiliateAction/);assert.match(src,/Journey details/);
});
test("calendar/base trim only general title copy, preserving specific relation and controls",()=>{
 const picker=source("components/easyt/morrovia-date-picker.tsx");
 const label=picker.slice(picker.indexOf('const panelLabel'),picker.indexOf('const placeholder'));
 assert.doesNotMatch(label,/chooseDate/);assert.match(picker,/Choose the start date, then the end date/);assert.match(picker,/Or type it/i);
 const builder=source("app/journey/new/trip-builder.tsx");
 assert.doesNotMatch(builder,/STAY BASES CONFIRMED|Your requested destinations and visits remain linked/);
 assert.match(builder,/Confirmed stay bases/);assert.match(builder,/visiting from \$\{selection.selectedName\}/);assert.match(builder,/Change base/);
});
