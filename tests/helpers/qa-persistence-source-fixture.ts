import ts from 'typescript';
import { readFileSync } from 'node:fs';

/** Execute production closures with explicit synthetic bindings; await their real async effect work. */
export function builderClosure(name: 'submitNewTripIntake' | 'persistDeviceRecovery' | 'seed-effect' | 'hydrate-effect' | 'starter-restore' | 'top-removal-confirm' | 'top-type-confirm' | 'updateDiscoveryPlanningState' | 'addDiscoverySearchSelection' | 'discovery-close' | 'route-workspace-commit' | 'top-controls-commit' | 'reorder-hook') {
  const file = name === 'starter-restore' ? 'new-trip-starter.tsx' : name === 'top-controls-commit' ? 'trip-builder-top-controls.tsx' : name === 'reorder-hook' ? 'use-builder-stop-reorder.ts' : 'trip-builder.tsx';
  const source = readFileSync(new URL(`../../app/journey/new/${file}`, import.meta.url), 'utf8');
  const tree = ts.createSourceFile('trip-builder.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression: string | undefined;
  function visit(node: ts.Node) {
    if ((['submitNewTripIntake','persistDeviceRecovery','updateDiscoveryPlanningState','addDiscoverySearchSelection'].includes(name)) && ts.isVariableDeclaration(node) && node.name.getText(tree) === name && node.initializer) expression = node.initializer.getText(tree);
    if (name === 'hydrate-effect' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('const hydrate = async')) expression = node.arguments[0].getText(tree);
    if (name === 'starter-restore' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('let next = emptyInput(ownerId)')) expression = node.arguments[0].getText(tree);
    if (name === 'seed-effect' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useEffect' && node.arguments[0]?.getText(tree).includes('builderSeed || !hydrated')) expression = node.arguments[0].getText(tree);
    if ((name === 'top-removal-confirm' || name === 'top-type-confirm') && ts.isJsxSelfClosingElement(node) && node.tagName.getText(tree) === 'MorroviaConfirmationDialog') {
      const pending = name === 'top-removal-confirm' ? 'pendingTopRemoval' : 'pendingTopType';
      const attributes = node.attributes.properties.filter(ts.isJsxAttribute);
      if (attributes.some(attribute => attribute.name.getText(tree) === 'open' && attribute.initializer?.getText(tree).includes(pending))) {
        const confirm = attributes.find(attribute => attribute.name.getText(tree) === 'onConfirm');
        if (confirm?.initializer && ts.isJsxExpression(confirm.initializer) && confirm.initializer.expression) expression = confirm.initializer.expression.getText(tree);
      }
    }
    if ((name === 'discovery-close' || name === 'route-workspace-commit') && ts.isJsxSelfClosingElement(node)
      && node.tagName.getText(tree) === (name === 'discovery-close' ? 'DiscoveryModal' : 'TripBuilderRouteWorkspace')) {
      const attribute = node.attributes.properties.filter(ts.isJsxAttribute).find(item => item.name.getText(tree) === (name === 'discovery-close' ? 'onClose' : 'onCommitOrder'));
      if (attribute?.initializer && ts.isJsxExpression(attribute.initializer) && attribute.initializer.expression) expression = attribute.initializer.expression.getText(tree);
    }
    if (name === 'top-controls-commit' && ts.isCallExpression(node) && node.expression.getText(tree) === 'useBuilderStopReorder' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      const property = node.arguments[0].properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(tree) === 'onCommit');
      if (property && ts.isPropertyAssignment(property)) expression = property.initializer.getText(tree);
    }
    if (name === 'reorder-hook' && ts.isFunctionDeclaration(node) && node.name?.getText(tree) === 'useBuilderStopReorder') expression = '(' + node.getText(tree).replace(/^export /, '') + ')';
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (!expression) throw new Error(`Production closure not found: ${name}`);
  // Observe the promises launched by effects without replacing their implementations
  // or guessing how many microtasks their persistence dependencies require.
  const prefix = 'const callback = ';
  const parsed = ts.createSourceFile('closure.tsx', prefix + expression, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  function track(node: ts.Node) {
    if (ts.isVoidExpression(node)) replacements.push({ start: node.getStart(parsed) - prefix.length, end: node.end - prefix.length,
      value: `__qaFixtureTrack(${node.expression.getText(parsed)})` });
    else ts.forEachChild(node, track);
  }
  track(parsed);
  for (const change of replacements.sort((a,b)=>b.start-a.start)) expression = expression.slice(0,change.start) + change.value + expression.slice(change.end);
  const js = ts.transpileModule(`${prefix}${expression};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const invoke = new Function('bindings', 'argument', '__qaFixtureTrack', `with(bindings){ ${js}; return Array.isArray(argument) ? callback(...argument) : callback(argument); }`);
  return async (bindings: Record<string, unknown>, argument?: unknown): Promise<unknown> => {
    const pending: Promise<unknown>[] = [];
    const result = await invoke(bindings, argument, (work: unknown) => {
      const promise = Promise.resolve(work); pending.push(promise); void promise.catch(()=>{});
    });
    await Promise.all(pending);
    return result;
  };
}
