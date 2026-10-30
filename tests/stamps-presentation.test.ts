import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

// Render the real Stamps component without running storage/network effects.
// Only React scheduling and analytics are substituted; atlas and domain logic are real.
const require = createRequire(import.meta.url);
const source = new URL("../", import.meta.url).pathname;
const script = (await build({
  entryPoints: [source + "app/journey/stamped/stamped-client.tsx"], bundle: true, write: false,
  format: "cjs", platform: "node", jsx: "automatic", logLevel: "silent",
  external: ["react/jsx-runtime", "lucide-react", "next/link"],
  plugins: [{ name: "synthetic-stamps", setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "synthetic" }));
    builder.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({ contents: `
      export const forwardRef = fn => fn;
      export const useState = initial => globalThis.hooks.state(initial);
      export const useMemo = fn => fn(); export const useRef = x => ({current:x});
      export const useId = () => 'synthetic-stamp'; export const useEffect = () => {};
    ` }));
    builder.onResolve({ filter: /lib\/analytics$/ }, () => ({ path: "analytics", namespace: "silent" }));
    builder.onLoad({ filter: /.*/, namespace: "silent" }, () => ({ contents: "export const trackEvent=()=>{}" }));
    builder.onLoad({ filter: /\.css$/ }, () => ({ contents: "export default new Proxy({}, {get:(_, key)=>key})", loader: "js" }));
  } }],
})).outputFiles[0].text;

function nodes(node: any): any[] {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!node?.props) return [];
  // Expand shared controls while leaving icon implementations as visual leaves.
  if (typeof node.type === "function" && /EasyT/.test(node.type.name)) return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
function content(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(content).join("");
  return node?.props ? content(node.props.children) : "";
}
function fixture(overrides: Record<string, unknown> = {}) {
  const values: any[] = []; let cursor = 0;
  const hooks = { state(initial: any) {
    const index = cursor++;
    if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial;
    return [values[index], (next: any) => { values[index] = typeof next === "function" ? next(values[index]) : next; }];
  } };
  const module = { exports: {} as any }, calls: unknown[][] = [];
  const effects: Array<() => void> = [];
  const window = { matchMedia: () => ({ matches: true }), setTimeout: (fn: () => void) => { effects.push(fn); } };
  new vm.Script(script).runInNewContext({ module, exports: module.exports, require, hooks, window, console, process });
  const props = { authenticated: true, ready: true, statuses: {}, memories: {}, photos: {},
    onStatusChange: (...args: unknown[]) => { calls.push(args); }, onMemorySave: async () => true, ...overrides };
  const render = () => { cursor = 0; return nodes(module.exports.StampedExperience(props)); };
  return { render, calls, props };
}
const row = (view: any[], name: string) => view.find(node => node.type === "li" && nodes(node).some(child => child.type === "strong" && content(child) === name));
const button = (parent: any, status: string) => nodes(parent).find(node => node.type === "button" && node.props["data-status"] === status);

test("Visited and Add use single-line named controls and retain remove/replace semantics", () => {
  for (const current of [undefined, "visited", "want"]) {
    const f = fixture({ statuses: current ? { france: current } : {} });
    const country = row(f.render(), "France"); assert.ok(country);
    const visited = button(country, "visited"), want = button(country, "want");
    assert.equal(content(visited), "Visited");
    assert.equal(content(want), current === "want" ? "Added" : "Add");
    assert.equal(visited.props["aria-pressed"], current === "visited");
    assert.equal(visited.props["aria-label"], current === "visited" ? "Remove visited mark from France" : "Mark France as visited");
    assert.equal(want.props["aria-label"], current === "want" ? "Added: Remove France from want to visit" : "Add France to want to visit");
    assert.equal(nodes(visited).some(node => node.type === "small"), false);
    assert.equal(visited.props.children.flat().filter(Boolean).at(-1).type.displayName, "Check");
    visited.props.onClick(); want.props.onClick();
    assert.deepEqual(f.calls, [["france", current === "visited" ? null : "visited", "explorer"], ["france", current === "want" ? null : "want", "explorer"]]);
  }
});

test("pending controls disable both existing status actions and retain row errors", () => {
  const country = row(fixture({ pendingStatusIds: ["france"], statusError: { countryId: "france", message: "Retry later" } }).render(), "France");
  assert.equal(button(country, "visited").props.disabled, true);
  assert.equal(button(country, "want").props.disabled, true);
  assert.ok(nodes(country).some(node => node.props.role === "alert" && content(node) === "Retry later"));
});

test("map stays first with five canonical region colors and inert pattern overlays", () => {
  const view = fixture({ statuses: { france: "visited", japan: "want" } }).render();
  assert.ok(view.findIndex(node => node.props["aria-label"] === "Interactive world map") < view.findIndex(node => node.type === "aside"));
  const countries = view.filter(node => node.type === "path" && node.props["data-country-id"]);
  assert.deepEqual([...new Set(countries.map(node => node.props["data-region"]))].sort(), ["Africa", "Americas", "Asia", "Europe", "Oceania"]);
  const unsupported = view.filter(node => node.type === "path" && node.props["aria-hidden"] === true && !node.props.className?.includes("pattern"));
  assert.ok(unsupported.length > 0);
  assert.ok(unsupported.every(node => node.props["data-region"] === undefined && node.props.role === undefined && node.props.tabIndex === -1));
  const patterns = view.filter(node => node.props.className?.includes("patternLayer"));
  assert.equal(patterns.length, 2);
  assert.deepEqual(patterns.map(node => [node.type, String(node.props["aria-hidden"]), node.props.tabIndex, node.props.onClick]), [["path", "true", undefined, undefined], ["path", "true", undefined, undefined]]);
});

test("country selection and map keyboard activation preserve details and memory/photo content", () => {
  const f = fixture({ statuses: { france: "visited" }, memories: { france: "A saved note" }, photos: { france: "data:image/png;base64,fixture" } });
  const initial = f.render(), france = initial.find(node => node.type === "path" && node.props["data-country-id"] === "france");
  france.props.onKeyDown({ key: "Enter", preventDefault() {}, currentTarget: { focus() {} } });
  const view = f.render();
  assert.ok(view.some(node => node.type === "h2" && content(node) === "France"));
  assert.ok(view.some(node => node.type === "p" && content(node) === "A saved note"));
  assert.ok(view.some(node => node.type === "img" && node.props.src === "data:image/png;base64,fixture"));
  assert.equal(row(view, "France").props["data-selected"], true);
  assert.ok(content(row(view, "France")).includes("Selected"));
});

test("search, no-results reset and regional filtering retain the real country catalogue", () => {
  const f = fixture(); let view = f.render();
  view.find(node => node.type === "input" && node.props.type === "search").props.onChange({ target: { value: "Democratic Republic of the Congo" } });
  view = f.render(); assert.equal(view.filter(node => node.type === "li").length, 1); assert.ok(row(view, "Democratic Republic of the Congo"));
  view.find(node => node.type === "input").props.onChange({ target: { value: "Atlantis" } });
  view = f.render(); assert.ok(view.some(node => content(node) === "No countries match those filters."));
  view.find(node => node.type === "button" && content(node) === "Clear filters").props.onClick();
  view = f.render(); assert.equal(view.filter(node => node.type === "li").length, 197);
  view.find(node => node.type === "select").props.onChange({ target: { value: "Europe" } });
  assert.ok(row(f.render(), "France"));
  assert.ok(!row(f.render(), "Japan"));
});

test("the selected memory editor still saves trimmed notes and the existing photo", async () => {
  const saved: unknown[][] = [];
  const f = fixture({ initialSelectedCountryId: "france", statuses: { france: "visited" },
    memories: { france: "Original" }, photos: { france: "data:image/png;base64,fixture" },
    onMemorySave: async (...args: unknown[]) => { saved.push(args); return true; } });
  f.render().find(node => node.type === "button" && content(node) === "Edit").props.onClick();
  let view = f.render();
  assert.equal(view.find(node => node.type === "textarea").props.value, "Original");
  view.find(node => node.type === "textarea").props.onChange({ target: { value: "  Updated memory  " } });
  view = f.render();
  view.find(node => node.type === "button" && content(node) === "Save memory").props.onClick();
  // The real click handler intentionally returns void; allow its awaited save to settle.
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(saved, [["france", "Updated memory", "data:image/png;base64,fixture"]]);
  assert.equal(f.render().some(node => node.type === "textarea"), false);
  assert.deepEqual(f.props.memories, { france: "Original" });
});

test("Spanish actions preserve full accessible removal names and region expansion", () => {
  const f = fixture({ language: "es", statuses: { france: "visited", japan: "want" } });
  let view = f.render();
  assert.equal(content(button(row(view, "France"), "visited")), "Visitado");
  assert.equal(button(row(view, "France"), "visited").props["aria-label"], "Quitar la marca de visitado de France");
  assert.equal(content(button(row(view, "Japan"), "want")), "Añadido");
  assert.equal(button(row(view, "Japan"), "want").props["aria-label"], "Añadido: Quitar Japan de Quiero visitar");
  view.find(node => node.type === "button" && node.props["aria-controls"] === "stamp-region-europe").props.onClick();
  view = f.render();
  assert.equal(row(view, "France"), undefined);
  assert.equal(view.find(node => node.props["aria-controls"] === "stamp-region-europe").props["aria-expanded"], false);
});

test("responsive CSS preserves wrapping names, green status, one search focus and compact map", () => {
  const css = readFileSync(source + "app/journey/stamped/stamped.module.css", "utf8");
  assert.match(css, /\.rowCountry strong\s*\{[^}]*font-size: 15px;[^}]*white-space: normal;/);
  assert.doesNotMatch(css, /\.rowCountry strong\s*\{[^}]*(?:text-overflow: ellipsis|white-space: nowrap)/);
  assert.doesNotMatch(css, /\.searchBox input:focus-visible,/);
  assert.doesNotMatch(css, /\.mapPanel\s*\{[^}]*order: 2/);
  assert.match(css, /\.mapViewport\s*\{[^}]*min-height: 210px/);
  assert.match(css, /\.rowActions[^}]*\[data-status="visited"\][^{]*\{[^}]*var\(--morrovia-success\)/);
  assert.match(css, /\.rowActions[^}]*button\s*\{[^}]*min-height: 44px/);
});
