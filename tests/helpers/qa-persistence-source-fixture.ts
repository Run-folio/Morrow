import ts from 'typescript';
import { readFileSync } from 'node:fs';

/** Execute the actual production closure with synthetic bindings, without a browser/React mount. */
export function builderClosure(name: 'submitNewTripIntake' | 'persistDeviceRecovery' | 'seed-effect' | 'hydrate-effect' | 'starter-restore') {
  const source = readFileSync(new URL(name === 'starter-restore' ? '../../app/journey/new/new-trip-starter.tsx' : '../../app/journey/new/trip-builder.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: string | undefined;
  function visit(node: ts.Node) {
    if ((name === 'submitNewTripIntake'||name==='persistDeviceRecovery') && ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) expression = node.initializer.getText(tree);
    if (name === 'hydrate-effect' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('const hydrate = async')) expression = node.arguments[0].getText(tree);
    if (name === 'starter-restore' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('let next = emptyInput(ownerId)')) expression = node.arguments[0].getText(tree);
    if (name === 'seed-effect' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('builderSeed || !hydrated')) expression = node.arguments[0].getText(tree);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!expression) throw new Error('Production closure not found');
  const js = ts.transpileModule(`const callback = ${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('bindings', 'argument', `with(bindings){ ${js}; return Array.isArray(argument) ? callback(...argument) : callback(argument); }`) as (bindings: Record<string, unknown>, argument?: unknown) => unknown;
}
