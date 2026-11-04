import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from 'typescript';
import {createDiscoveryDraft, reduceDiscoveryDraft, readDiscoveryDraft} from '../lib/easyt/discovery-draft.ts';
import {discoveryChoiceEvent} from '../lib/easyt/discovery-funnel.ts';
import {productionSource, sourceNode, sourceAttribute, evaluateSource, sourceBranchIsActive} from './helpers/production-source.ts';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared dialog owns Escape, scroll lock, focus return and a single scroll body", () => {
  const shell = read("components/easyt/builder-clarification-shell.tsx");
  assert.equal((shell.match(/role="dialog"/g) ?? []).length, 1);
  assert.match(shell, /event\.key === "Escape"/);
  assert.match(shell, /document\.body\.style\.overflow = "hidden"/);
  assert.match(shell, /returnFocus\?\.focus\(\)/);
  assert.match(shell, /className=\{styles\.body\}/);
  assert.doesNotMatch(shell, /history\.(pushState|popstate)/);
  assert.doesNotMatch(read("components/easyt/discovery-modal.tsx"), /role="dialog"|history\.(pushState|popstate)/);
});

test("mobile Discovery has one scroll body and safe-area clearance below the last card", () => {
  const css = read("components/easyt/builder-clarification-dialog.module.css");
  assert.match(css, /\.dialog\s*\{[^}]*max-height:\s*calc\(100dvh - 40px\)/);
  assert.match(css, /\.discoveryDialog\s*\{[^}]*height:\s*100dvh/);
  assert.match(css, /\.discoveryDialog \.body\s*\{[^}]*overflow-y:\s*auto/);
  assert.doesNotMatch(css, /\.discoveryDialog\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css, /\.discoveryDialog \.footer\s*\{[^}]*env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.footer > div\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("normal typed and sparse entries select Discovery; only recovery selects legacy renderer", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /discoveryEntryForBrief\(/);
  assert.match(builder, /renderedDiscoveryEntry\.kind === "legacy-recovery"/);
  assert.match(builder, /<DiscoveryModal/);
  assert.match(builder, /<BuilderClarificationDialog/);
  assert.match(builder, /discoveryEntry\.kind !== "skip"/);
});

test("Back changes only the draft step and does not route browser history", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /onAction\(\{ type: "set-step", step: previousStep \}\)/);
  assert.doesNotMatch(modal, /history\.(pushState|replaceState|popstate)/);
});

test("partial confirmation leaves Discovery open and explains unresolved choices at the commit boundary", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(builder, /commitDiscoveryReview\(/);
  assert.match(builder, /if \(!result\.ok\)[\s\S]*?return;/);
  assert.match(modal, /search\?\.error[^\n]*role="alert"/);
});

test("canonical search uses stop eligibility and asks before extending the original geography", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /discoverySearchStopSuggestion\(suggestion\)/);
  assert.match(builder, /discoverySearchOutsideMention\(suggestion, activeClarificationMention\)/);
  assert.match(builder, /addDiscoverySearchSelection\(suggestion, false\)/);
  assert.match(read("components/easyt/discovery-modal.tsx"), /outsideChoice\.onAdd/);
});

test("global visual steps own direction, shortlist, and progressive display without country gates", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /<DiscoverySteps/);
  assert.match(steps, /type: "change-direction"/);
  assert.match(steps, /type: "set-step", step: "places"/);
  assert.match(steps, /"remove-shortlist" : "add-shortlist"/);
  assert.match(steps, /availableActions\(place\)/);
  assert.match(steps, /visiblePlaceIds/);
  assert.doesNotMatch(steps, /projection\.recommendedIds\.includes\(place\.id\)/);
  assert.doesNotMatch(steps, /Australia|places\.length\s*[><=]+\s*20/);
});

test("the adaptive shell has an honest loading and sparse recovery presentation", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  const stories = read("components/easyt/discovery-modal.stories.tsx");
  assert.match(modal, /loading\?: boolean/);
  assert.match(modal, /copy\.status\.loading/);
  assert.match(modal, /MorroviaSkeleton/);
  assert.match(stories, /AustraliaLoading/);
  assert.match(stories, /TajLandmarkProductionSparse/);
  assert.match(stories, /AustraliaSaveError/);
});

test("a genuine zero-result entry renders only the intentional search state", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  const copy = read("lib/easyt/i18n.ts");
  assert.match(steps, /if \(allPlaces\.length === 0 && !projection\.directions\.length && draft\.shortlistIds\.length === 0\) return/);
  assert.match(steps, /data-discovery-state="empty"/);
  assert.match(steps, /copy\.empty/);
  assert.match(steps, /\{search \? <div className=\{styles\.search\}>\{search\}<\/div> : null\}/);
  assert.match(copy, /No suggested stops here yet\./);
  assert.match(copy, /Aún no hay paradas sugeridas aquí\./);
});

test("pending unresolved intent uses semantic EN and ES labels", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const copy = read("lib/easyt/i18n.ts");
  assert.match(builder, /discoveryPendingDecisionLabel\(language, mention\.placeType\)/);
  assert.match(copy, /Places still to choose/);
  assert.match(copy, /Base still to choose/);
  assert.match(copy, /Stay or base still to choose/);
  assert.match(copy, /Lugares aún por elegir/);
  assert.match(copy, /Base aún por elegir/);
  assert.match(copy, /Estancia o base aún por elegir/);
});

test("visual Discovery uses the modal title and secondary geography without duplicate step headings", () => {
  const modal = read("components/easyt/discovery-modal.tsx");
  const steps = read("components/easyt/discovery-steps.tsx");
  const ast=ts.createSourceFile('modal.tsx',modal,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const expressions=new Map<string,string>();
  function visit(node:ts.Node){
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='baseTitle'&&node.initializer)expressions.set('baseTitle',node.initializer.getText(ast));
    if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='BuilderClarificationShell')for(const prop of node.attributes.properties){
      if(ts.isJsxAttribute(prop)&&['title','description'].includes(prop.name.getText(ast))&&prop.initializer&&ts.isJsxExpression(prop.initializer)&&prop.initializer.expression)
        expressions.set(prop.name.getText(ast),prop.initializer.expression.getText(ast));
    }
    ts.forEachChild(node,visit);
  }visit(ast);
  const evaluate=(key:string,scope:object)=>new Function('scope',`with(scope){${ts.transpileModule(`return (${expressions.get(key)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
  for(const [rootBaseChoice,language,title,description] of [[false,'en','Explore places','Balkans'],
    [true,'en','Where will you stay in Bali?','Island · Indonesia'],[true,'es','¿Dónde te alojarás en Bali?','Isla · Indonesia']] as const){
    const scope={rootBaseChoice,language,baseChoice:{area:{name:'Bali',country:'Indonesia'}},copy:{steps:{places:'Explore places'}},step:'places',name:'Balkans',baseTitle:''};
    scope.baseTitle=evaluate('baseTitle',scope);
    assert.equal(evaluate('title',scope),title);assert.equal(evaluate('description',scope),description);
  }
  assert.doesNotMatch(steps, /<h[1-6][^>]*>\{copy\.steps|styles\.eyebrow\}>\{copy\.steps/);
  assert.doesNotMatch(steps, /<p className=\{styles\.truth\}>/);
});

test("Builder commit locks every Discovery navigation and dismissal path", async () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  const shell = read("components/easyt/builder-clarification-shell.tsx");
  assert.match(builder, /loading=\{discoveryCommitting\}/);
  assert.match(modal, /onDismiss=\{\(\) => onClose\("closed"\)\}[^>]*loading=\{loading\}/);
  const tree = productionSource("components/easyt/discovery-modal.tsx");
  const back = sourceNode(tree, (node): node is ts.ConditionalExpression => ts.isConditionalExpression(node)
    && ts.isJsxElement(node.whenTrue) && node.whenTrue.children.some(child => ts.isJsxExpression(child)
      && child.expression?.getText() === "copy.actions.back"), "Discovery Back control");
  for (const [previousStep, rootBaseChoice, expected] of [
    [undefined, false, false], [undefined, true, false], ["directions", false, true], ["directions", true, false],
  ] as const) assert.equal(Boolean(evaluateSource(back.condition, {previousStep, rootBaseChoice})), expected);
  const button = (back.whenTrue as ts.JsxElement).openingElement;
  for (const loading of [false, true]) assert.equal(evaluateSource(sourceAttribute(button, "disabled"), {loading}), loading);
  assert.match(modal, /variant="quiet" disabled=\{loading\} onClick=\{\(\) => onClose\("finish_later"\)\}/);
  assert.match(shell, /if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); if \(!loadingRef\.current\) dismissRef\.current\(\);/);
  assert.match(shell, /if \(event\.target === event\.currentTarget && !loading\) onDismiss\(\)/);
  assert.match(shell, /iconOnly variant="quiet" size="small" disabled=\{loading\}/);
  const steps = sourceNode(tree, (node): node is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText() === "DiscoverySteps", "Discovery choices");
  for (const [loading, rootBaseChoice, expected] of [
    [false, false, true], [true, false, false], [false, true, false], [true, true, false],
  ] as const) assert.equal(sourceBranchIsActive(steps, {loading, rootBaseChoice}), expected);
  const owner = sourceNode(productionSource("app/journey/new/trip-builder.tsx"), (node): node is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText() === "DiscoveryModal", "Builder Discovery owner");
  for (const state of ["editable", "committing", "stale-view", "unsupported-version"]) {
    let writes = 0, events = 0;
    const draft = createDiscoveryDraft(), version = {current: 0};
    const action = evaluateSource<(action: unknown) => Promise<boolean>>(sourceAttribute(owner, "onAction"), {
      discoveryCommitRef: {current: state === "committing"}, planningAreaViewRef: {current: {key: "current-view"}},
      planningAreaViewKey: state === "stale-view" ? "old-view" : "current-view",
      discoveryRead: {status: state === "unsupported-version" ? "unsupported-version" : "current"},
      discoverySearchVersionRef: version, capturePlanningAreaView: () => () => true, reduceDiscoveryDraft,
      discoveryDraft: draft, discoveryChoiceEvent, discoveryEventKind: "country", discoveryProjection: {places: []},
      trackEvent: () => { events++; }, activeClarificationMention: {mentionId: "synthetic-mention"},
      discoveryEntry: {step: "places"}, readDiscoveryDraft,
      updateDiscoveryPlanningState: async (update: (current: object) => object) => {
        writes++; const result = update({discoveryDraftByMentionId: {"synthetic-mention": draft}});
        assert.ok(result); return true;
      },
    });
    assert.equal(await action({type: "set-step", step: "places"}), state === "editable", state);
    assert.equal(writes, state === "editable" ? 1 : 0, `${state}: no guarded draft mutation`);
    assert.equal(version.current, state === "editable" ? 1 : 0, `${state}: no guarded search-version retirement`);
    assert.equal(events, 0, "step navigation must not fabricate a place-choice analytics event");
  }
});

test("Builder confirmation uses the same fail-closed review gate and base as Discovery", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(builder, /const review = canonicalDiscoveryReview/);
  assert.match(builder, /canonicalReview=\{canonicalDiscoveryReview\}/);
  assert.match(builder, /!review\?\.canConfirm/);
});

test("Discovery exposes one card mutation, reset and reviewed search without early route mutation", () => {
  const steps = read("components/easyt/discovery-steps.tsx");
  const modal = read("components/easyt/discovery-modal.tsx");
  const builder = read("app/journey/new/trip-builder.tsx");
  assert.match(steps, /copy\.actions\.shortlist/);
  assert.match(steps, /copy\.actions\.remove/);
  assert.doesNotMatch(steps, /copy\.actions\.stayHere|copy\.actions\.splitStay|copy\.actions\.explore/);
  assert.match(modal, /type: "reset"/);
  assert.match(modal, /draft\.removedIds\.length/);
  assert.match(builder, /selectCanonicalSearchResult\(/);
  assert.match(builder, /discoveryPlaceWithinMention\(/);
  assert.match(builder, /discoveryBaseSuitableForMention\(/);
  assert.match(builder, /reviewedPlace\.actionability === "browse-only"/);
  assert.match(modal, /contextCountries=\{mention\.parentCountries\}/);
  assert.match(modal, /includeNonRoutable/);
  assert.doesNotMatch(modal, /parentConstraint=\{entry\.kind/);
  const tree = productionSource("app/journey/new/trip-builder.tsx");
  const modalNode = sourceNode(tree, (node): node is ts.JsxSelfClosingElement => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText() === "DiscoveryModal", "Builder Discovery owner");
  const close = sourceAttribute(modalNode, "onClose");
  assert.ok(ts.isArrowFunction(close) && close.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword));
  const checkpoint = sourceNode(close, (node): node is ts.AwaitExpression => ts.isAwaitExpression(node)
    && ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression)
    && node.expression.expression.name.text === "persistDeviceRecovery", "awaited owned Discovery checkpoint");
  const call = checkpoint.expression as ts.CallExpression;
  const receiver = (call.expression as ts.PropertyAccessExpression).expression.getText();
  assert.equal(call.arguments[0]?.getText(), `${receiver}.trip`, "checkpoint must use its captured owner's current document");
  assert.match(close.getText(), /await updateDiscoveryPlanningState/);
  assert.match(close.getText(), /discoveryDraftByMentionId/);
  assert.doesNotMatch(close.getText(), /addGuidedPlanningPlace|confirmAttractionVisit|commitDiscoveryReview/,
    "dismissal must preserve the draft without accepting route choices");
  assert.match(modal, /saveError \? <MorroviaStatusBanner/);
});
