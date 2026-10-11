import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);

test('local photo credit follows successful load, error fallback and a recovered source', () => {
  // Execute both production components with a deterministic hook scheduler;
  // image events are delivered directly, without a browser or provider request.
  type Frame = { values: any[]; cursor: number; effects: (() => void)[]; dirty: boolean };
  let active: Frame;
  const frame = (): Frame => ({ values: [], cursor: 0, effects: [], dirty: false });
  const same = (a: unknown[] | undefined, b: unknown[] | undefined) => Boolean(a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i])));
  const hooks = {
    useState(initial: any) {
      const owner = active, index = owner.cursor++;
      if (!(index in owner.values)) owner.values[index] = typeof initial === 'function' ? initial() : initial;
      return [owner.values[index], (next: any) => {
        const value = typeof next === 'function' ? next(owner.values[index]) : next;
        if (!Object.is(value, owner.values[index])) { owner.values[index] = value; owner.dirty = true; }
      }];
    },
    useCallback(callback: any, deps: unknown[]) {
      const index = active.cursor++, previous = active.values[index];
      if (!previous || !same(previous.deps, deps)) active.values[index] = { deps, callback };
      return active.values[index].callback;
    },
    useEffect(effect: () => void, deps: unknown[]) {
      const index = active.cursor++, previous = active.values[index];
      if (!previous || !same(previous, deps)) { active.values[index] = deps; active.effects.push(effect); }
    },
  };
  const Credit = () => null;
  const load = (path: string, imports: Record<string, unknown>) => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} as any };
    new Function('require', 'module', 'exports', output)((id: string) => id === 'react' ? hooks : id in imports ? imports[id] : require(id), module, module.exports);
    return module.exports;
  };
  const ResilientImage = load('../components/easyt/resilient-image.tsx', {}).default;
  const Media = load('../components/easyt/journey-local-place-photo.tsx', {
    '@/lib/easyt/google-place-photo': {},
    './morrovia-photo-credit': { default: Credit },
    './resilient-image': { default: ResilientImage },
  }).JourneyLocalPlacePhotoMedia;
  const mediaFrame = frame();
  let imageFrame = frame(), imageKey: unknown, image: any, children: any[];
  let errors = 0;
  const props = { place: { name: 'Fixture hotel', mapsUrl: 'https://example.test/map' }, photo: { src: '/good.png', attributions: [{ displayName: 'Fixture photographer', uri: 'https://example.test/source' }] }, fallback: 'Neutral fallback', onError: () => errors++ };
  const run = (component: any, owner: Frame, props: any) => {
    active = owner; owner.cursor = 0; owner.dirty = false;
    return component(props);
  };
  const render = () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const media = run(Media, mediaFrame, props);
      children = media.props.children;
      const resilient = children[0];
      if (imageKey !== resilient.key) { imageKey = resilient.key; imageFrame = frame(); }
      image = run(ResilientImage, imageFrame, resilient.props);
      for (const owner of [mediaFrame, imageFrame]) for (const effect of owner.effects.splice(0)) effect();
      if (!mediaFrame.dirty && !imageFrame.dirty) return;
    }
    assert.fail('photo components did not settle');
  };
  const hasCredit = () => children.some(child => child && child.type === Credit);
  render();
  assert.equal(image.type, 'img');
  assert.equal(hasCredit(), false, 'attempting a photo does not establish display');
  image.props.onLoad({}); render();
  assert.equal(hasCredit(), true, 'loaded photo has attribution');
  assert.equal(children[1].props.sourceHref, 'https://example.test/source');
  image.props.onError({}); render();
  assert.equal(image.props.children, 'Neutral fallback');
  assert.equal(hasCredit(), false, 'absent photograph has no photo credit');
  assert.equal(errors, 1, 'caller still receives its failure event');
  props.photo = { ...props.photo, src: '/recovered.png' }; render();
  assert.equal(image.type, 'img'); assert.equal(image.props.src, '/recovered.png');
  assert.equal(hasCredit(), false, 'new source waits for successful display');
  image.props.onLoad({}); render();
  assert.equal(hasCredit(), true, 'new successful source restores attribution');
});
