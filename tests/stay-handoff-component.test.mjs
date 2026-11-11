import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const script = (await build({ entryPoints: ["components/easyt/trip-stay-handoff.tsx"], bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic", plugins: [{name:"handoff-runtime",setup(builder) {
  builder.onResolve({filter:/^react$/},()=>({path:"react",namespace:"hooks"}));
  builder.onLoad({filter:/.*/,namespace:"hooks"},()=>({contents:`export const forwardRef=f=>globalThis.__react.forwardRef(f); export const useState=v=>{const i=globalThis.__index++;globalThis.__state[i]??=v;return [globalThis.__state[i],n=>globalThis.__state[i]=n]};export const useRef=v=>({current:v});export const useEffect=()=>{};export const useLayoutEffect=()=>{};export const useCallback=f=>f;export const useId=()=>"handoff";`}));
  builder.onResolve({filter:/\.module\.css$/},args=>({path:args.path,namespace:"css"}));
  builder.onLoad({filter:/.*/,namespace:"css"},()=>({contents:"export default new Proxy({}, {get:(_,key)=>String(key)});"}));
  builder.onResolve({filter:/^@\/lib\/analytics$/},()=>({path:"analytics",namespace:"analytics"}));
  builder.onLoad({filter:/.*/,namespace:"analytics"},()=>({contents:"export const trackEvent=()=>{};"}));
}}]})).outputFiles[0].text;
const details = "Hotel: A\nLocation: Tokyo\nCheck-in: 2027-03-09";
const action = {provider:"trip.com",category:"accommodation",href:"https://www.trip.com/t/pdAWQqi56W2",cta:"Check accommodation",affiliate:true};
function nodes(node) { if (!node || typeof node !== "object") return []; return Array.isArray(node) ? node.flatMap(nodes) : [node,...nodes(node.props?.children)]; }
function text(node) { return typeof node === "string" ? node : Array.isArray(node) ? node.map(text).join("") : text(node?.props?.children ?? ""); }
function runtime(writeText, summary) {
  const sandbox = {module:{exports:{}},exports:{},require,__react:require("react"),__state:[],__index:0,navigator:{clipboard:{writeText}}};
  sandbox.exports = sandbox.module.exports;vm.runInNewContext(script,sandbox);
  const render = () => { sandbox.__index=0;return nodes(sandbox.module.exports.default({details,action,summary,context:{placement:"stay_workspace_detail",tripId:"trip",stopId:"return"}})); };
  return {render};
}
test("copy writes exact details and reports success only after clipboard acceptance",async()=>{
  let finish; const copied=[];const app=runtime(value=>{copied.push(value);return new Promise(resolve=>{finish=resolve;});});
  const copying=app.render().find(n=>n.props?.onClick)?.props.onClick();
  assert.deepEqual(copied,[details]);
  assert.equal(app.render().some(n=>n.props?.role==="status"&&text(n)==="Stay details copied"),false);
  finish();await copying;
  assert.equal(app.render().some(n=>n.props?.role==="status"&&text(n)==="Stay details copied"),true);
});
test("denied clipboard leaves selectable details, retry and partner handoff available",async()=>{
  const app=runtime(async()=>{throw Error("permission denied");});
  await app.render().find(n=>n.props?.onClick).props.onClick();const result=app.render();
  assert.equal(text(result.find(n=>n.type==="pre")),details);
  assert.match(text(result.find(n=>n.props?.role==="status"&&text(n))),/Couldn’t copy/);
  assert.ok(result.some(n=>n.props?.onClick));
  const link=result.find(n=>n.type?.name==="MorroviaAffiliateLink");
  assert.equal(link.props.action.href,action.href);assert.equal(link.props.action.cta,"Open Trip.com");
});


test("the focused handoff puts the supplied property and date summary before provider actions",()=>{
  const summary={type:"div",props:{children:["Tokyo", "Hotel A", "Shortlisted · Not booked", "9–11 March 2027 · 2 nights"]}};
  const result=runtime(async()=>{},summary).render();
  const heading=result.findIndex(n=>n.type==="h2"&&text(n)==="Find your stay");
  const property=result.indexOf(summary);
  const copy=result.findIndex(n=>n.props?.onClick);
  const provider=result.findIndex(n=>n.type?.name==="MorroviaAffiliateLink");
  assert.ok(heading>=0&&heading<property&&property<copy&&copy<provider);
  assert.equal(result.find(n=>n.props?.id==="stay-handoff").props.tabIndex,-1);
  assert.equal(result[provider].props.action.href,action.href);
});
