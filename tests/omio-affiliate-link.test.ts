import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { affiliateClickEventForAction } from "../lib/easyt/affiliate-click.ts";
import * as affiliateReadiness from "../lib/easyt/booking-readiness.ts";
import { transportWorkspaceHref } from "../lib/easyt/trip-workspace-links.ts";

test("Omio links retain external-link protections, disclosure and accessible labels", () => {
  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  const prep = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  const link = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  const promotion = readFileSync("components/easyt/partner-promotion.tsx", "utf8");
  const styles = readFileSync("components/easyt/trip-itinerary-workspace.module.css", "utf8");
  assert.match(itinerary, /<MorroviaAffiliateLink action=\{action\}/);
  assert.match(itinerary, /<small>\{affiliateDisclosure\}<\/small>/);
  assert.match(itinerary, /<MorroviaPartnerPromotion action=\{action\}/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="sponsored noopener noreferrer"/);
  assert.match(link, /opens \$\{providerLabel\} in a new tab/);
  assert.match(link, /Partner link · Morrovia may earn a commission at no extra cost to you/);
  assert.match(prep, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  assert.match(styles, /\.omioAction > a \{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.omioAction > a:focus-visible/);
  assert.match(promotion, /target="_blank" rel="noopener noreferrer"/);
});

test("current Omio clicks emit one event with only approved partner, placement and trip-safe identifiers", () => {
  assertOmioClickContract();

  const itinerary = readFileSync("components/easyt/trip-itinerary-workspace.tsx", "utf8");
  assert.match(itinerary, /placement: "itinerary_transfer", tripId: trip\.id, transferId: leg\.id, originStopId: leg\.fromStopId, destinationStopId: leg\.toStopId/);
  assert.equal((itinerary.match(/placement: "itinerary_transfer"/g) ?? []).length, 1);

  const events: unknown[] = [];
  const taskActionClick = evaluateDeclaration(readFileSync("components/easyt/trip-preparation.tsx", "utf8"), "taskActionClick", {
    trackEvent: (name: string, properties: unknown) => events.push({ name, properties }),
  });
  const task = { kind: "transport", action: { provider: "omio", transferId: "leg", originStopId: "from", destinationStopId: "to", url: "https://example.invalid/?private=do-not-track" } };
  const before = structuredClone(task);
  taskActionClick(task, "trip")();
  assert.deepEqual(events, [{ name: "affiliate_link_clicked", properties: { partner: "omio", placement: "overview_before_you_go", tripId: "trip", transferId: "leg", originStopId: "from", destinationStopId: "to" } }]);
  assert.deepEqual(task, before);
});

test("Overview transport readiness navigates to its workspace or exact issue instead of the retired outbound action", () => {
  const scope = { trip: { id: "trip" }, language: "en", visibleIssues: [] as {actionLabel: string; href: string}[], transportWorkspaceHref };
  const progressAction = evaluateDeclaration(readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8"), "progressAction", scope);
  assert.deepEqual(progressAction({ id: "transport" }), { href: "/journey/trip/transport", label: "Review transport" });
  scope.visibleIssues.push({ actionLabel: "Review transfers", href: "/journey/trip/transport?leg=leg" });
  assert.deepEqual(progressAction({ id: "transport" }), { href: "/journey/trip/transport?leg=leg", label: "Review transfers" });
});

test("click regression checks reject private URL leakage and duplicate events", () => {
  const source = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  const leaky = source.replace("const event = affiliateClickEventForAction(action, context);", 'const event = {name:"affiliate_link_clicked", properties:{...context,partner:action.provider,href:action.href}};');
  const duplicate = source.replace("onClickSupplement?.();", "trackEvent(event.name, event.properties); onClickSupplement?.();");
  assert.notEqual(leaky, source);
  assert.notEqual(duplicate, source);
  assert.throws(() => assertOmioClickContract(leaky), assert.AssertionError);
  assert.throws(() => assertOmioClickContract(duplicate), assert.AssertionError);
});

function evaluateDeclaration(source: string, name: string, scope: Record<string, unknown>) {
  const ast = ts.createSourceFile("component.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let body: string | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) body = node.getText(ast).replace(/^export\s+(?:default\s+)?/, "");
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name && node.initializer) body = `const ${name} = ${node.initializer.getText(ast)};`;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(body, `production declaration ${name} is required`);
  const js = ts.transpileModule(body, { compilerOptions: { jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("scope", `with(scope){${js};return ${name};}`)(scope);
}

function assertOmioClickContract(source = readFileSync("components/easyt/affiliate-link.tsx", "utf8")) {
  for (const renderAsSurface of [false, true]) {
    const events: unknown[] = [];
    const scope = {
      React: { Fragment: "fragment", createElement: (type: unknown, props: any, ...children: unknown[]) => ({ type, props: { ...props, children } }) },
      useId: () => "handoff", styles: {}, EasyTLinkButton: "link", ExternalLink: "icon",
      ...affiliateReadiness, affiliateClickEventForAction,
      trackEvent: (name: string, properties: unknown) => events.push({ name, properties }),
    };
    const render = evaluateDeclaration(source, "MorroviaAffiliateLink", scope);
    const action = Object.freeze({ provider: "omio", category: "transport", href: "https://example.invalid/?booking=private-canary", cta: "Compare transport", affiliate: true });
    const context = Object.freeze({ placement: "itinerary_transfer", tripId: "trip", transferId: "leg", originStopId: "from", destinationStopId: "to", email: "synthetic@example.invalid", bookingUrl: action.href });
    const before = JSON.stringify({ action, context });
    const result = render({ action, context, renderAsSurface });
    const link = renderAsSurface ? result : result.props.children[0];
    link.props.onClick();
    assert.deepEqual(events, [{ name: "affiliate_link_clicked", properties: { partner: "omio", placement: "itinerary_transfer", tripId: "trip", stopId: undefined, transferId: "leg", originStopId: "from", destinationStopId: "to" } }]);
    assert.equal(JSON.stringify({ action, context }), before);
  }
}

test("Impact attribution is mounted once through the consent-gated root boundary", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  const tracking = readFileSync("components/optional-affiliate-tracking.tsx", "utf8");
  assert.equal((layout.match(/<OptionalAffiliateTracking \/>/g) ?? []).length, 1);
  assert.doesNotMatch(layout, /utt\.impactcdn\.com|trackImpression/);
  assert.match(tracking, /hasAffiliateTrackingConsent\(\)/);
  assert.match(tracking, /OMIO_IMPACT_SCRIPT_ID = "omio-impact-tracking"/);
});
