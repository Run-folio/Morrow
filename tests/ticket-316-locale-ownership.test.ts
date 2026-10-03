import assert from "node:assert/strict";
import test from "node:test";

import * as i18n from "../lib/easyt/i18n.ts";

type Runtime = {
  stored: string | null;
  documentLanguage: string;
  notifications: string[];
};

function runtime(state: Runtime) {
  return {
    read: () => state.stored,
    write: (language: "en" | "es") => { state.stored = language; },
    setDocumentLanguage: (language: "en" | "es") => { state.documentLanguage = language; },
    notify: (language: "en" | "es") => { state.notifications.push(language); },
  };
}

test("an established browser-session locale wins over a different account preference", () => {
  assert.equal(i18n.resolveSessionLanguage?.("en", "es"), "en");
  assert.equal(i18n.resolveSessionLanguage?.("es", "en"), "es");
});

test("an account preference seeds a browser session only when no valid session locale exists", () => {
  assert.equal(i18n.resolveSessionLanguage?.(null, "es"), "es");
  assert.equal(i18n.resolveSessionLanguage?.("obsolete", "es"), "es");
  assert.equal(i18n.resolveSessionLanguage?.(undefined, undefined), "en");
});

test("beta session establishment renders English without overwriting browser or account preference", () => {
  const state: Runtime = { stored: "es", documentLanguage: "es", notifications: [] };

  const established = i18n.establishSessionLanguage?.("es", runtime(state));

  assert.equal(established, "en");
  assert.equal(state.stored, "es");
  assert.equal(state.documentLanguage, "en");
  assert.deepEqual(state.notifications, ["en"]);
  assert.equal(i18n.languageFromStorage(), "en", "stored locale does not select beta rendering language");
});

test("fresh beta sessions render English and account Spanish preference remains stored only at account", () => {
  const state: Runtime = { stored: null, documentLanguage: "", notifications: [] };

  assert.equal(i18n.establishSessionLanguage?.(undefined, runtime(state)), "en");
  assert.equal(state.stored, null);
  assert.equal(state.documentLanguage, "en");

  assert.equal(i18n.establishSessionLanguage?.("es", runtime(state)), "en");
  assert.equal(state.stored, null);
  assert.equal(state.documentLanguage, "en");
  assert.deepEqual(state.notifications, ["en", "en"]);
});

test("the explicit locale API remains available for the full localization rollout", () => {
  const state: Runtime = { stored: "es", documentLanguage: "es", notifications: [] };

  const selected = i18n.commitSessionLanguage?.("es", runtime(state));

  assert.equal(selected, "es");
  assert.equal(state.stored, "es");
  assert.equal(state.documentLanguage, "es");
  assert.deepEqual(state.notifications, ["es"]);
});

test("an explicit selection still reaches the document and live consumers when storage is unavailable", () => {
  const state: Runtime = { stored: null, documentLanguage: "en", notifications: [] };
  const unavailableStorage = {
    ...runtime(state),
    write: () => { throw new Error("storage unavailable"); },
  };

  assert.equal(i18n.commitSessionLanguage?.("es", unavailableStorage), "es");
  assert.equal(state.stored, null);
  assert.equal(state.documentLanguage, "es");
  assert.deepEqual(state.notifications, ["es"]);
});

test("Spanish localization dictionaries remain available for the post-beta rollout", () => {
  assert.equal(i18n.easytCopy.es.nav.newTrip, "Nuevo viaje");
  assert.equal(i18n.easytCopy.es.nav.language, "Idioma");
});
