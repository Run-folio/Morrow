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

test("session establishment synchronizes storage, document language and current consumers", () => {
  const state: Runtime = { stored: null, documentLanguage: "en", notifications: [] };

  const established = i18n.establishSessionLanguage?.("es", runtime(state));

  assert.equal(established, "es");
  assert.equal(state.stored, "es");
  assert.equal(state.documentLanguage, "es");
  assert.deepEqual(state.notifications, ["es"]);
});

test("the English fallback does not become a persisted session choice before an account locale is known", () => {
  const state: Runtime = { stored: null, documentLanguage: "", notifications: [] };

  assert.equal(i18n.establishSessionLanguage?.(undefined, runtime(state)), "en");
  assert.equal(state.stored, null);
  assert.equal(state.documentLanguage, "en");

  assert.equal(i18n.establishSessionLanguage?.("es", runtime(state)), "es");
  assert.equal(state.stored, "es");
  assert.equal(state.documentLanguage, "es");
  assert.deepEqual(state.notifications, ["en", "es"]);
});

test("an explicit language selection always replaces the current session locale immediately", () => {
  const state: Runtime = { stored: "es", documentLanguage: "es", notifications: [] };

  const selected = i18n.commitSessionLanguage?.("en", runtime(state));

  assert.equal(selected, "en");
  assert.equal(state.stored, "en");
  assert.equal(state.documentLanguage, "en");
  assert.deepEqual(state.notifications, ["en"]);
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
