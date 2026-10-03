import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

const interactiveTags = new Set(["a", "button", "Link", "EasyTButton", "EasyTLinkButton", "MorroviaAffiliateLink"]);

function sourceFile(path: string) {
  const source = readFileSync(path, "utf8");
  return { source, file: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX) };
}

function findFunction(file: ts.SourceFile, name: string) {
  let match: ts.FunctionDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) match = node;
    if (!match) ts.forEachChild(node, visit);
  };
  visit(file);
  assert.ok(match?.body, `${name} must remain a named production composition owner`);
  return match;
}

function tagName(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  return (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText();
}

function jsxNodes(root: ts.Node) {
  const nodes: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function contentInitializer(fn: ts.FunctionDeclaration) {
  let initializer: ts.Expression | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "content") initializer = node.initializer;
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(fn.body!);
  assert.ok(initializer, "surface content must be composed once before semantic ownership is selected");
  return initializer;
}

function returnedJsxRoots(fn: ts.FunctionDeclaration) {
  const roots: Array<ts.JsxElement | ts.JsxSelfClosingElement> = [];
  const visit = (node: ts.Node) => {
    if (ts.isReturnStatement(node) && node.expression && (ts.isJsxElement(node.expression) || ts.isJsxSelfClosingElement(node.expression))) roots.push(node.expression);
    ts.forEachChild(node, visit);
  };
  visit(fn.body!);
  return roots;
}

function assertSingleActionSurface(path: string, owner: string, expectedRoots: string[], expectsAffiliate = true) {
  const { file } = sourceFile(path);
  const fn = findFunction(file, owner);
  const content = contentInitializer(fn);
  assert.deepEqual(jsxNodes(content).map(tagName).filter((tag) => interactiveTags.has(tag)), [], `${owner} content must not nest another link or button`);

  const roots = returnedJsxRoots(fn);
  assert.deepEqual(roots.map(tagName).sort(), expectedRoots.sort());
  for (const root of roots.filter((node) => interactiveTags.has(tagName(node)))) {
    assert.match(root.getText(), /className=\{className\}/, `${tagName(root)} must own the styled surface`);
    assert.match(root.getText(), /\{content\}/, `${tagName(root)} must contain the complete meaningful surface`);
    assert.doesNotMatch(root.getText(), /\b(?:role|tabIndex|onKeyDown)=/, `${tagName(root)} must keep native keyboard semantics`);
  }
  const affiliateRoot = roots.find((node) => tagName(node) === "MorroviaAffiliateLink");
  if (expectsAffiliate) {
    assert.ok(affiliateRoot);
    assert.match(affiliateRoot.getText(), /renderAsSurface/, "affiliate tracking must live on the same semantic surface");
  } else {
    assert.equal(affiliateRoot, undefined);
  }
}

test("the production Overview composition gives every actionable readiness tile one semantic surface", () => {
  assertSingleActionSurface("components/easyt/trip-overview-workspace.tsx", "ArrangeItem", ["article", "Link"], false);
});

test("the production Before-you-go composition gives every single-action task row one semantic surface", () => {
  assertSingleActionSurface("components/easyt/trip-preparation.tsx", "TripPreparationTaskRow", ["article", "article", "MorroviaAffiliateLink", "a", "a", "Link"]);
  const { file } = sourceFile("components/easyt/trip-preparation.tsx");
  const cue = findFunction(file, "TaskActionCue");
  assert.deepEqual(jsxNodes(cue).map(tagName).filter((tag) => interactiveTags.has(tag)), [], "the visible row cue must not become a nested control");
});

test("the surface itself owns padding, focus, hover and a touch target without pseudo-element hit areas", () => {
  const overviewStyles = readFileSync("components/easyt/trip-overview-workspace.module.css", "utf8");
  const preparationStyles = readFileSync("components/easyt/trip-preparation.module.css", "utf8");
  assert.match(overviewStyles, /\.arrangeItem \{[\s\S]*?min-height: 198px;[\s\S]*?padding: 20px;/);
  assert.match(overviewStyles, /\.arrangeItemInteractive:hover/);
  assert.match(overviewStyles, /\.arrangeItemInteractive:focus-visible/);
  assert.match(preparationStyles, /\.taskRow \{[\s\S]*?min-height: 72px;[\s\S]*?padding: 10px 12px;/);
  assert.match(preparationStyles, /\.taskRowInteractive:hover/);
  assert.match(preparationStyles, /\.taskRowInteractive:focus-visible/);
  assert.doesNotMatch(`${overviewStyles}\n${preparationStyles}`, /::after\s*\{[^}]*inset:\s*0/);
});

test("affiliate surfaces retain canonical outbound semantics and an announced new-tab destination", () => {
  const affiliate = readFileSync("components/easyt/affiliate-link.tsx", "utf8");
  assert.match(affiliate, /renderAsSurface[\s\S]*target="_blank"[\s\S]*rel="sponsored noopener noreferrer"/);
  assert.match(affiliate, /<span className="sr-only">\{`Opens \$\{providerLabel\} in a new tab\.`\}<\/span>/);
});


test("practical cards keep review and navigation as separate native interactive controls", () => {
  const { file } = sourceFile("components/easyt/trip-preparation.tsx");
  const cards = findFunction(file, "TripPreparationCards");
  const elements = jsxNodes(cards);
  for (const element of elements.filter((node) => interactiveTags.has(tagName(node)))) {
    if (ts.isJsxElement(element)) {
      const nested = element.children.flatMap((child) => jsxNodes(child)).filter((node) => interactiveTags.has(tagName(node)));
      assert.equal(nested.length, 0, `${tagName(element)} must not contain the status or another action`);
    }
  }
  assert.ok(!elements.some((node) => tagName(node) === "EasyTSelect"));
  const review = elements.find((node) => tagName(node) === "EasyTButton" && /role="checkbox"/.test(node.getText()));
  assert.ok(review);
  assert.match(review.getText(), /aria-checked=\{reviewed\}/);
  assert.match(review.getText(), /onStatusChange\(task.id, reviewed \? "to-review" : "sorted"\)/);
  assert.match(review.getText(), /Mark \$\{task.title\} as/);
  assert.match(review.getText(), /Marcar la tarea \$\{task.title\} como/);
  const styles = readFileSync("components/easyt/trip-preparation.module.css", "utf8");
  assert.match(styles, /\.overviewPrepReview \{[^}]*width: 44px; min-height: 44px;/);
  assert.match(styles, /\.overviewPrepReview\[aria-checked="true"\]/);
});
