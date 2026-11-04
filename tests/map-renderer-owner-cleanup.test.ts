import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import {createMapRenderer} from '../lib/easyt/map-renderer-lifecycle.ts';
import {productionSource, sourceNode, sourceVariable, evaluateSource} from './helpers/production-source.ts';

const source = productionSource('components/journey-planner-map.tsx');
const cleanup = sourceNode(source, (node): node is ts.ArrowFunction => ts.isArrowFunction(node)
  && ts.isReturnStatement(node.parent) && ts.isBlock(node.body)
  && node.body.statements.some(statement => ts.isExpressionStatement(statement)
    && ts.isBinaryExpression(statement.expression) && statement.expression.left.getText() === 'ownerActive'
    && statement.expression.right.kind === ts.SyntaxKind.FalseKeyword), 'Map component renderer cleanup');

function fixture(throwOnRemove: boolean) {
  let removals = 0, detached = 0, errors = 0, unavailable = 0, warnings = 0;
  let errorListener: ((event: {error: Error}) => void) | null = null;
  const gl = {isContextLost: () => false, getExtension: () => null};
  const host = {className: '', remove() { detached++; }};
  const container = {ownerDocument: {createElement: (tag: string) => tag === 'canvas'
    ? {getContext: () => gl, remove() {}} : host}, appendChild() {}};
  const lifecycle = {dispose() {}, handleError: () => false};
  const scope: Record<string, any> = {ownerActive: true, removing: false,
    mapDiagnostics: {dispose() {}}, disposeAttribution() {}, basemapLifecycle: lifecycle,
    basemapLifecycleRef: {current: lifecycle}, stopMarkersRef: {current: []}, legMarkersRef: {current: []},
    pinMarkersRef: {current: []}, localPlaceMarkersRef: {current: []}, draftPinRef: {current: null},
    reportUnavailable: () => { unavailable++; },
    console: {warn: () => { warnings++; }, error: () => { errors++; }},
  };
  const map = {
    getCanvas: () => ({getContext: () => gl}),
    on(_event: string, listener: typeof errorListener) { errorListener = listener; },
    off() { errorListener = null; },
    remove() {
      removals++;
      assert.equal(scope.ownerActive, false, 'retire UI ownership before renderer teardown');
      assert.equal(scope.mapRef.current, null, 'retire map publication before renderer teardown');
      const abort = new Error('Operation aborted'); abort.name = 'AbortError';
      if (!errorListener) throw new Error('Unhandled removal-time map error');
      errorListener({error: abort});
      if (throwOnRemove) throw new Error('Synthetic renderer cleanup failure');
    },
  };
  const renderer = createMapRenderer(container as any, 'synthetic-canvas', () => map);
  assert.equal(renderer.kind, 'ready');
  scope.map = map; scope.mapRef = {current: map}; scope.renderer = renderer;
  map.on('error', evaluateSource(sourceVariable(source, 'handleMapError'), scope));
  return {scope, run: evaluateSource<() => void>(cleanup, scope), counts: () => ({removals, detached, errors, unavailable, warnings})};
}

test('actual Map owner cleanup contains removal-time aborts and disposes the healthy renderer once', () => {
  const h = fixture(false);
  h.run();
  assert.deepEqual(h.counts(), {removals: 1, detached: 1, errors: 0, unavailable: 0, warnings: 0});
  assert.equal(h.scope.basemapLifecycleRef.current, null);
  const replacement = {};
  h.scope.mapRef.current = replacement; h.scope.basemapLifecycleRef.current = replacement;
  h.run();
  assert.equal(h.scope.mapRef.current, replacement, 'stale cleanup cannot clear a newer map publication');
  assert.equal(h.scope.basemapLifecycleRef.current, replacement);
  assert.deepEqual(h.counts(), {removals: 1, detached: 1, errors: 0, unavailable: 0, warnings: 0});
});

test('actual Map owner cleanup reports a renderer failure without throwing or leaving its DOM host', () => {
  const h = fixture(true);
  assert.doesNotThrow(h.run);
  assert.deepEqual(h.counts(), {removals: 1, detached: 1, errors: 0, unavailable: 0, warnings: 1});
  h.run();
  assert.deepEqual(h.counts(), {removals: 1, detached: 1, errors: 0, unavailable: 0, warnings: 1});
});
