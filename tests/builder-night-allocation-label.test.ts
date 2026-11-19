import assert from "node:assert/strict";
import test from "node:test";
import { builderNightAllocationLabel, builderNightProgressLabel, builderNightEditWarning } from "../app/journey/new/builder-night-allocation-label.ts";

test("night allocation copy reports the canonical difference in English and Spanish", () => {
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 12, complete: false, language: "en" }), "2 nights left to plan");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 13, complete: false, language: "en" }), "1 night left to plan");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 15, complete: false, language: "en" }), "1 night too many");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 16, complete: false, language: "en" }), "2 nights too many");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 12, complete: false, language: "es" }), "Quedan 2 noches por planificar");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 13, complete: false, language: "es" }), "Queda 1 noche por planificar");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 15, complete: false, language: "es" }), "Sobra 1 noche");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 16, complete: false, language: "es" }), "Sobran 2 noches");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 14, complete: true, language: "en" }), "All allocated");
  assert.equal(builderNightAllocationLabel({ total: 14, allocated: 14, complete: true, language: "es" }), "Todas asignadas");
});

test("a matching total with a required empty stay asks for nights",()=>{
 assert.equal(builderNightAllocationLabel({total:14,allocated:14,complete:false,language:"en"}),"Stays need nights");
 assert.equal(builderNightAllocationLabel({total:14,allocated:14,complete:false,language:"es"}),"Hay estancias sin noches");
});

test("route-local edit warnings survive balanced or protected state; only proven duplicate totals are omitted", () => {
 const warning={tone:"warning" as const,title:"2 nights need to be removed",detail:"No unlocked donor.",balanceDelta:-2};
 assert.equal(builderNightEditWarning(warning,-2,"en"),"No unlocked donor.");
 assert.match(builderNightEditWarning(warning,0,"en")!,/Last edit: 2 nights need to be removed No unlocked donor/);
 assert.equal(builderNightEditWarning({tone:"warning",title:"Protected stay"},0,"en"),"Last edit: Protected stay");
 assert.equal(builderNightEditWarning({...warning,tone:"info"},0,"en"),null);
});


test("final Route progress states preserve actual totals, singular and plural, in both languages", () => {
  const progress = (allocated: number, total: number, language: "en" | "es" = "en", complete = allocated === total) => builderNightProgressLabel({ allocated, total, language, complete });
  assert.equal(progress(12, 15), "12/15 nights planned. 3 nights remaining.");
  assert.equal(progress(14, 15), "14/15 nights planned. 1 night remaining.");
  assert.equal(progress(0, 1), "0/1 night planned. 1 night remaining.");
  assert.equal(progress(0, 0), "0/0 nights planned.");
  assert.equal(progress(15, 15), "15/15 nights planned.");
  assert.equal(progress(15, 15, "en", false), "15/15 nights planned.", "unassigned individual stops have their own warning");
  assert.equal(progress(16, 15), "16/15 nights planned. 1 night too many.");
  assert.equal(progress(17, 15), "17/15 nights planned. 2 nights too many.");
  assert.equal(progress(12, 15, "es"), "12/15 noches planificadas. Quedan 3 noches.");
  assert.equal(progress(0, 1, "es"), "0/1 noche planificada. Queda 1 noche.");
  assert.equal(progress(1, 1, "es"), "1/1 noche planificada.");
  assert.equal(progress(16, 15, "es"), "16/15 noches planificadas. Sobra 1 noche.");
  assert.equal(progress(17, 15, "es"), "17/15 noches planificadas. Sobran 2 noches.");
});
