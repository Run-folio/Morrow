import assert from "node:assert/strict";
import test from "node:test";
import { easytCopy, renderDiscoveryReason, availableActions, discoveryDirectionTitle, discoveryShortlistCount } from "../lib/easyt/i18n.ts";
import { australiaDiscoveryPlaces } from "../lib/easyt/australia-discovery-content.ts";

test("visual Discovery has complete English and Spanish UI grammar", () => {
  assert.equal(easytCopy.en.builder.visualDiscovery.actions.shortlist, "Add to shortlist");
  assert.equal(easytCopy.es.builder.visualDiscovery.actions.shortlist, "Añadir a la selección");
  assert.equal(discoveryShortlistCount("en", 1), "1 place shortlisted");
  assert.equal(discoveryShortlistCount("es", 1), "1 lugar seleccionado");
  for (const language of ["en", "es"] as const) {
    const copy = easytCopy[language].builder.visualDiscovery;
    for (const group of [copy.actions, copy.steps, copy.roles, copy.types, copy.status, copy.accessibility, copy.directions]) {
      assert.ok(Object.values(group).every(value => typeof value === "string" && value.trim().length > 0));
    }
    assert.ok(copy.shortlist && copy.review && copy.sparse && copy.noPhoto);
    assert.match(discoveryDirectionTitle(language, "discovery.direction.australiaEastCoast"), /\S/);
    assert.match(renderDiscoveryReason(language, australiaDiscoveryPlaces()[0]!), /\S/);
  }
});

test("browse-only places cannot expose overnight actions", () => {
  const place = australiaDiscoveryPlaces().find(item => item.actionability === "browse-only")!;
  assert.ok(place);
  assert.equal(availableActions(place).includes("stay-here"), false);
  assert.equal(availableActions(place).includes("explore"), true);
});
