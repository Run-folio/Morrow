import assert from "node:assert/strict";
import test from "node:test";

import {
  installMorroviaMapControls,
  morroviaMapOptions,
} from "../components/easyt/morrovia-map-runtime.ts";
import {
  createMorroviaStopMarker,
  morroviaStopMarkerModel,
  setMorroviaStopMarkerState,
} from "../components/easyt/morrovia-map-markers.ts";

test("surface interaction never hides the requested attribution presentation", () => {
  assert.equal(morroviaMapOptions({ variant: "preview" }, "compact").interactive, false);
  assert.deepEqual(morroviaMapOptions({ variant: "preview" }, "compact").attributionControl, { compact: true });
  assert.equal(morroviaMapOptions({ variant: "embedded", interaction: "selection-only" }, "compact").interactive, false);
  assert.deepEqual(morroviaMapOptions({ variant: "workspace" }, "expanded").attributionControl, { compact: false });
});

test("controls follow the surface policy without adding unrelated controls", () => {
  const controls: Array<{ control: unknown; position?: string }> = [];
  const navigation = { kind: "navigation", showCompass: false };
  const runtime = { NavigationControl: class { constructor(options: { showCompass: boolean }) { assert.deepEqual(options, { showCompass: false }); return navigation; } } };
  const map = { addControl(control: unknown, position?: string) { controls.push({ control, position }); } };

  installMorroviaMapControls(map, runtime, { variant: "preview" });
  assert.deepEqual(controls, []);
  installMorroviaMapControls(map, runtime, { variant: "workspace" });
  assert.deepEqual(controls, [{ control: navigation, position: "top-right" }]);
});

test("repeated stops and fallback labels retain occurrence identity", () => {
  const first = morroviaStopMarkerModel({ id: "tokyo-first", sequence: 1, name: "Tokyo", interactive: true, selected: false });
  const second = morroviaStopMarkerModel({ id: "tokyo-return", sequence: 3, name: "Tokyo", interactive: true, selected: true });
  assert.notEqual(first.dataset.mapStopId, second.dataset.mapStopId);
  assert.equal(second.label, "Stop 3: Tokyo");
  assert.equal(second.text, "3");
  assert.equal(second.tagName, "button");
  assert.match(second.classNames.join(" "), /is-active/);
});

test("preview markers use presentation markup and marker state remains updateable", () => {
  const attributes = new Map<string, string>();
  const classes = new Set<string>();
  const element = {
    className: "",
    classList: { toggle(name: string, enabled = false) { enabled ? classes.add(name) : classes.delete(name); } },
    dataset: {} as Record<string, string>,
    setAttribute(name: string, value: string) { attributes.set(name, value); },
    textContent: "",
    type: "",
    append(child: { textContent: string }) { this.textContent = child.textContent; },
  };
  let elementCount = 0;
  const documentLike = { createElement(tagName: string) {
    assert.equal(tagName, "span");
    elementCount += 1;
    return elementCount === 1 ? element : {
      className: "", textContent: "", dataset: {}, setAttribute() {}, append() {},
      classList: { toggle() {} },
    };
  } };
  const marker = createMorroviaStopMarker(documentLike, {
    id: "porto", sequence: 2, name: "Porto", interactive: false, selected: false, journeyEnd: true,
  });

  assert.equal(marker, element);
  assert.equal(element.dataset.mapStopId, "porto");
  assert.equal(attributes.get("aria-hidden"), "true");
  assert.match(element.className, /is-preview/);
  assert.match(element.className, /is-destination/);
  setMorroviaStopMarkerState(element, { selected: true, origin: true, journeyEnd: false });
  assert.deepEqual([...classes].sort(), ["is-active", "is-origin"]);
});
