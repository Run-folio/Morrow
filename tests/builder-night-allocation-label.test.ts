import assert from "node:assert/strict";
import test from "node:test";
import { builderNightAllocationLabel } from "../app/journey/new/builder-night-allocation-label.ts";

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
