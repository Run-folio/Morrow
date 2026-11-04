import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

/** Inspect and execute the production expression, not a rewritten test implementation. */
export function productionSource(path: string) {
  return ts.createSourceFile(path, readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
export function sourceNode<T extends ts.Node>(root: ts.Node, predicate: (node: ts.Node) => node is T, label: string): T {
  const matches: T[] = [];
  function visit(node: ts.Node) { if (predicate(node)) matches.push(node); ts.forEachChild(node, visit); }
  visit(root); assert.equal(matches.length, 1, `${label}: expected exactly one production node`); return matches[0]!;
}
export function sourceAttribute(node: ts.JsxOpeningLikeElement, name: string) {
  const prop = node.attributes.properties.filter(ts.isJsxAttribute).find(prop => prop.name.getText() === name);
  assert.ok(prop?.initializer && ts.isJsxExpression(prop.initializer) && prop.initializer.expression, `Missing production expression: ${name}`);
  return prop.initializer.expression;
}
export function sourceVariable(root: ts.Node, name: string) {
  const declaration = sourceNode(root, (node): node is ts.VariableDeclaration => ts.isVariableDeclaration(node) && node.name.getText() === name, name);
  assert.ok(declaration.initializer, `Missing initializer: ${name}`); return declaration.initializer;
}
export function evaluateSource<T = unknown>(expression: ts.Node, bindings: Record<string, unknown>): T {
  const js = ts.transpileModule(`return (${expression.getText()});`, {compilerOptions: {target: ts.ScriptTarget.ES2022}}).outputText;
  return new Function('bindings', `with(bindings){${js}}`)(bindings) as T;
}
export function openingWithClass(root: ts.Node, tag: string, className: string) {
  return sourceNode(root, (node): node is ts.JsxOpeningElement => ts.isJsxOpeningElement(node) && node.tagName.getText() === tag
    && node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText() === 'className' && prop.initializer
      && ts.isJsxExpression(prop.initializer) && prop.initializer.expression && ts.isPropertyAccessExpression(prop.initializer.expression)
      && prop.initializer.expression.name.text === className), `${tag}.${className}`);
}

/** Evaluate ternary JSX ancestors only; do not silently ignore a new logical guard.
 * This deliberately fails closed if a caller needs &&/|| rendering support. */
export function sourceBranchIsActive(node: ts.Node, bindings: Record<string, unknown>) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    assert.ok(!ts.isBinaryExpression(parent) || ![ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken].includes(parent.operatorToken.kind),
      'Logical JSX ancestor requires explicit branch coverage');
    if (!ts.isConditionalExpression(parent)) continue;
    const branch = evaluateSource(parent.condition, bindings) ? parent.whenTrue : parent.whenFalse;
    if (node.pos < branch.pos || node.end > branch.end) return false;
  }
  return true;
}
