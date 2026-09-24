import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildCountryDiscovery } from "../lib/easyt/country-discovery.ts";
import * as i18n from "../lib/easyt/i18n.ts";
import { resolvePlaceMentions } from "../lib/easyt/place-intelligence.ts";

const mention = (name: string) => {
  const resolved = resolvePlaceMentions(name).mentions[0];
  assert.ok(resolved, `${name} resolves`);
  return resolved;
};

test("country discovery keeps structured facts stable while localizing Spanish rationale", () => {
  const candidate = buildCountryDiscovery(mention("Tajikistan"), {
    totalNights: 8,
    interests: ["nature"],
  }).candidates.find((item) => item.reason === "Matches your nature interest.");
  assert.ok(candidate, "fixture includes the known English interest rationale");

  const english = i18n.countryDiscoveryCandidatePresentation?.("en", candidate);
  const spanish = i18n.countryDiscoveryCandidatePresentation?.("es", candidate);

  assert.equal(english?.reason, "Matches your nature interest.");
  assert.equal(english?.stayGuidance, candidate.stayGuidance);
  assert.equal(spanish?.reason, "Coincide con tu interés por la naturaleza.");
  assert.doesNotMatch(`${spanish?.reason} ${spanish?.stayGuidance}`, /Matches your|Typically|Allow at least|route guidance/i);
  assert.deepEqual(candidate.recommendationReason, { kind: "interest-match", interest: "nature" });
  assert.equal(candidate.placeId, english?.placeId);
  assert.equal(candidate.placeId, spanish?.placeId);
  assert.equal(candidate.score, english?.score);
  assert.equal(candidate.score, spanish?.score);
});

test("every #321 rationale and stay template has a Spanish rendering without changing proper nouns", () => {
  const render = i18n.countryDiscoveryCandidatePresentation;
  assert.equal(typeof render, "function");
  const base = { placeId: "fixture", score: 12, reason: "English fallback must not render." };

  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "named-place-country-match" } })?.reason,
    "Está en el mismo país que un lugar que nombraste expresamente.");
  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "minimum-stay-fits" } })?.reason,
    "Su estancia mínima conocida cabe en una parte de las noches de este viaje.");
  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "supported-within", parentName: "Tajikistan" } })?.reason,
    "Un lugar respaldado dentro de Tajikistan; revisa cómo encaja en tu ruta.");
  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "interest-match", interest: "nature" } })?.reason,
    "Coincide con tu interés por la naturaleza.");
  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "interest-match", interest: "wildlife" } })?.reason,
    "Coincide con tu interés por la fauna.");

  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "minimum-stay-fits" },
    stayGuidance: "Typically 2 nights in Morrovia's reviewed route guidance",
    recommendationStayGuidance: { kind: "typical", nights: 2 } })?.stayGuidance,
    "Normalmente, 2 noches según la guía de rutas revisada de Morrovia");
  assert.equal(render?.("es", { ...base, recommendationReason: { kind: "minimum-stay-fits" },
    stayGuidance: "Allow at least 1 nights in existing route guidance",
    recommendationStayGuidance: { kind: "minimum", nights: 1 } })?.stayGuidance,
    "Reserva al menos 1 noche según la guía de rutas existente");
});

test("country-discovery controls and count-aware CTA are owned by the shared locale", () => {
  const spanish = i18n.easytCopy.es.builder.countryDiscovery;
  assert.equal(spanish.recommendedPlaces, "Lugares recomendados");
  assert.equal(spanish.add, "Añadir");
  assert.equal(spanish.selectedRemove, "Seleccionado · Quitar");
  assert.equal(spanish.seeMore, "Ver más lugares");
  assert.equal(spanish.searchSpecific, "Buscar un lugar concreto");
  assert.match(spanish.sparseFallback, /busca un lugar concreto/);

  assert.equal(i18n.countryDiscoveryContinueLabel?.("es", 1), "Continuar con 1 lugar");
  assert.equal(i18n.countryDiscoveryContinueLabel?.("es", 2), "Continuar con 2 lugares");
  assert.equal(i18n.countryDiscoveryContinueLabel?.("en", 1), "Continue with 1 place");
  assert.equal(i18n.countryDiscoveryContinueLabel?.("en", 2), "Continue with 2 places");
});

test("Spanish country-discovery stories do not inherit the English removal action", () => {
  const stories = readFileSync(new URL("../components/easyt/builder-clarification-dialog.stories.tsx", import.meta.url), "utf8");
  const spanish = stories.split("export const CountryDiscoverySpanish: Story = {")[1]?.split("export const CountryDiscoverySpanishSparse: Story = {")[0];
  const sparse = stories.split("export const CountryDiscoverySpanishSparse: Story = {")[1]?.split("const japanMention")[0];

  assert.match(spanish ?? "", /removeLabel: "Quitar Tajikistan del viaje"/);
  assert.match(sparse ?? "", /removeLabel: "Quitar Eritrea del viaje"/);
});
