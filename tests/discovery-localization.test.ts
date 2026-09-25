import assert from "node:assert/strict";
import test from "node:test";
import { easytCopy, renderDiscoveryReason, availableActions, discoveryDirectionTitle, discoveryShortlistCount } from "../lib/easyt/i18n.ts";
import { australiaDiscoveryPlaces } from "../lib/easyt/australia-discovery-content.ts";
import { discoveryPlaceForId } from "../lib/easyt/discovery-content.ts";

test("visual Discovery has complete English and Spanish UI grammar", () => {
  assert.equal(easytCopy.en.builder.visualDiscovery.actions.shortlist, "Add");
  assert.equal(easytCopy.es.builder.visualDiscovery.actions.shortlist, "Añadir");
  assert.equal(easytCopy.en.builder.visualDiscovery.actions.remove, "Remove");
  assert.equal(easytCopy.es.builder.visualDiscovery.actions.remove, "Quitar");
  assert.equal(easytCopy.en.builder.visualDiscovery.directions.supported, "Explore");
  assert.equal(easytCopy.es.builder.visualDiscovery.directions.supported, "Explorar");
  assert.equal(discoveryShortlistCount("en", 1), "1 place");
  assert.equal(discoveryShortlistCount("es", 1), "1 lugar");
  assert.equal(discoveryShortlistCount("en", 0), "0 places");
  assert.equal(discoveryShortlistCount("es", 0), "0 lugares");
  for (const language of ["en", "es"] as const) {
    const copy = easytCopy[language].builder.visualDiscovery;
    for (const group of [copy.actions, copy.steps, copy.roles, copy.reviewStatus, copy.types, copy.status, copy.accessibility, copy.directions]) {
      assert.ok(Object.values(group).every(value => typeof value === "string" && value.trim().length > 0));
    }
    assert.ok(copy.shortlist && copy.steps.review && copy.sparse && copy.noPhoto);
    assert.match(discoveryDirectionTitle(language, "discovery.direction.australiaEastCoast"), /\S/);
    assert.match(renderDiscoveryReason(language, australiaDiscoveryPlaces()[0]!), /\S/);
  }
});

test("visual Discovery copy keeps one concise prompt per step", () => {
  const en = easytCopy.en.builder.visualDiscovery;
  const es = easytCopy.es.builder.visualDiscovery;
  assert.equal(en.steps.review, "Review choices");
  assert.equal(es.steps.review, "Revisa tus elecciones");
  assert.equal(en.directionIntro, "Pick a route direction to explore.");
  assert.equal(es.directionIntro, "Elige una dirección de ruta para explorar.");
  assert.equal(en.roles["overnight-base"], "Overnight base");
  assert.equal(es.roles["overnight-base"], "Base para pernoctar");
  assert.equal(en.reviewStatus.exploreOnly, "Not ready to add");
  assert.equal(es.reviewStatus.exploreOnly, "Aún no se puede añadir");
  assert.equal(en.reviewStatus.unavailable, "No longer reviewed");
  assert.equal(es.reviewStatus.unavailable, "Ya no figura entre los lugares revisados");
  assert.equal(en.reviewStatus.resolveDetail, "Remove unavailable places or Finish later.");
  assert.equal(es.reviewStatus.resolveDetail, "Quita los lugares no disponibles o termina más tarde.");
  assert.equal(en.sparse, "Limited coverage here");
  assert.equal(es.sparse, "Cobertura limitada aquí");
});

test("reviewed place descriptions lead with the visitor reason in both languages", () => {
  const otherIds = ["arusha", "puerto-princesa", "el-nido", "dushanbe", "khujand", "panjakent", "petra"];
  const places = [...australiaDiscoveryPlaces(), ...otherIds.map(discoveryPlaceForId).filter(place => place !== null)];
  for (const place of places) {
    assert.doesNotMatch(renderDiscoveryReason("en", place), /^(Explore|Visit)\b/, place.id);
    assert.doesNotMatch(renderDiscoveryReason("es", place), /^(Explora|Visita)\b/, place.id);
  }
});

test("browse-only places cannot expose overnight actions", () => {
  const place = australiaDiscoveryPlaces().find(item => item.actionability === "browse-only")!;
  assert.ok(place);
  assert.equal(availableActions(place).includes("stay-here"), false);
  assert.equal(availableActions(place).includes("explore"), true);
});
