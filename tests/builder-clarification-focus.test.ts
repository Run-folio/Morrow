import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const shellSource = () => readFileSync(new URL('../components/easyt/builder-clarification-shell.tsx', import.meta.url), 'utf8');
const autocompleteSource = readFileSync(new URL('../components/easyt/canonical-place-autocomplete.tsx', import.meta.url), 'utf8');

function callback(text: string, find: (node: ts.Node, tree: ts.SourceFile) => ts.ArrowFunction | undefined) {
  const tree = ts.createSourceFile('actual.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found: ts.ArrowFunction | undefined;
  function visit(node: ts.Node) { found ??= find(node, tree); ts.forEachChild(node, visit); }
  visit(tree); assert.ok(found, 'The actual production callback must exist');
  const js = ts.transpileModule(`const actual = ${found.getText(tree)};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return (scope: Record<string, unknown>) => new Function('scope', `with(scope){${js}return actual;}`)(scope);
}
function shellEffect(kind: 'focus' | 'trap') {
  return callback(shellSource(), (node, tree) => {
    if (!ts.isCallExpression(node) || node.expression.getText(tree) !== 'useEffect') return;
    const arrow = node.arguments[0];
    if (!arrow || !ts.isArrowFunction(arrow)) return;
    return arrow.getText(tree).includes(kind === 'focus' ? 'titleRef' : 'const returnFocus') ? arrow : undefined;
  });
}
function autocompleteHandler(name: 'onBlur' | 'onFocus' | 'onChange') {
  return callback(autocompleteSource, (node, tree) => {
    if (!ts.isJsxAttribute(node) || node.name.getText(tree) !== name) return;
    const opening = node.parent.parent;
    if (name !== 'onBlur' && (!ts.isJsxOpeningElement(opening) && !ts.isJsxSelfClosingElement(opening)
      || opening.tagName.getText(tree) !== 'input')) return;
    const expression = node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined;
    return expression && ts.isArrowFunction(expression) ? expression : undefined;
  });
}

/** Finite DOM ports, not a renderer or browser. Production effect/event bodies
 * own the focus and blur decisions; these ports only deliver their events. */
function focusPorts() {
  let menuOpen = false, dismissals = 0;
  const listeners = new Map<string, (event: any) => void>();
  const frames = new Map<number, { run: () => void; cancelled: boolean }>();
  const timers: Array<() => void> = [];
  let nextFrame = 0;
  let blur: (event: unknown) => void;
  const documentPort = { activeElement: null as ElementPort | null, body: { style: { overflow: 'auto' } },
    addEventListener: (name: string, fn: (event: any) => void) => listeners.set(name, fn),
    removeEventListener: (name: string, fn: (event: any) => void) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  class ElementPort {
    parent: ElementPort | null = null;
    children: ElementPort[] = [];
    readonly name: string;
    constructor(name: string) { this.name = name; }
    contains(value: unknown): boolean {
      for (let current = value instanceof ElementPort ? value : null; current; current = current.parent) if (current === this) return true;
      return false;
    }
    focus() {
      const previous = documentPort.activeElement; documentPort.activeElement = this;
      if (previous === input && this !== input) blur({ currentTarget: root, relatedTarget: this });
    }
    querySelectorAll() { return this.children; }
  }
  const trigger = new ElementPort('trigger'), dialog = new ElementPort('dialog'), heading = new ElementPort('heading');
  const root = new ElementPort('autocomplete'), input = new ElementPort('input'), close = new ElementPort('close'), footer = new ElementPort('footer');
  root.parent = dialog; input.parent = root; heading.parent = dialog; close.parent = dialog; footer.parent = dialog;
  dialog.children = [close, input, footer]; documentPort.activeElement = trigger;
  const windowPort = { requestAnimationFrame: (run: () => void) => { const id = ++nextFrame; frames.set(id, { run, cancelled: false }); return id; },
    cancelAnimationFrame: (id: number) => { const frame = frames.get(id); if (frame) frame.cancelled = true; },
    setTimeout: (run: () => void) => { timers.push(run); return timers.length; } };
  const completedSearchRef = {current:{sequence:0,controller:null as AbortController|null}};
  const completedState = {suggestions:['previous result'] as unknown[],status:'ready',researchUsed:true};
  const autocomplete = { rootRef: { current: root }, window: windowPort, document: documentPort,
    completedSearchRef,setCompletedSuggestions:(value:unknown[])=>{completedState.suggestions=value;},
    setCompletedSearchStatus:(value:string)=>{completedState.status=value;},setPublicResearchUsed:(value:boolean)=>{completedState.researchUsed=value;},
    submitFreeTextOnBlur: false, onSubmitFreeText() {}, onChange() {}, setOpen: (open: boolean) => { menuOpen = open; }, setActiveIndex() {} };
  blur = autocompleteHandler('onBlur')(autocomplete);
  const focusInput = () => { input.focus(); autocompleteHandler('onFocus')(autocomplete)(); };
  const enterQuery = () => { focusInput(); autocompleteHandler('onChange')(autocomplete)({ target: { value: 'Santa Cruz de Tenerife' } }); };
  const scope = { open: true, itemKey: 'island:places', dialogRef: { current: dialog }, titleRef: { current: heading },
    dismissRef: { current: () => { dismissals++; } }, loadingRef: { current: false }, document: documentPort, window: windowPort, HTMLElement: ElementPort };
  return { scope, trigger, dialog, heading, input, close, footer, root, enterQuery, focusInput, ElementPort,completedSearchRef,completedState,
    activeName: () => documentPort.activeElement?.name, menuOpen: () => menuOpen, dismissals: () => dismissals,
    frameCount: () => frames.size, cancelledFrames: () => [...frames.values()].filter(frame => frame.cancelled).length,
    runFrames: (deliverCancelled = false) => { const pending = [...frames.values()]; frames.clear(); for (const frame of pending) if (deliverCancelled || !frame.cancelled) frame.run(); },
    runTimers: () => { for (const run of timers.splice(0)) run(); },
    key: (key: string, shiftKey = false) => { let prevented = false; listeners.get('keydown')?.({ key, shiftKey, preventDefault() { prevented = true; } }); return prevented; },
    listenerCount: () => listeners.size };
}

test('actual deferred shell focus cannot blur an already edited combobox and close its menu', () => {
  const f = focusPorts(); shellEffect('focus')(f.scope)();
  f.enterQuery(); f.runFrames(); f.runTimers();
  assert.deepEqual({ active: f.activeName(), menuOpen: f.menuOpen() }, { active: 'input', menuOpen: true });
});

test('actual autocomplete typing retires completed search without changing focus ownership',()=>{
  const f=focusPorts(),pending=new AbortController();f.completedSearchRef.current.controller=pending;
  f.enterQuery();assert.equal(pending.signal.aborted,true);assert.equal(f.completedSearchRef.current.sequence,1);
  assert.equal(f.completedSearchRef.current.controller,null);
  assert.deepEqual(f.completedState,{suggestions:[],status:'idle',researchUsed:false});
  assert.equal(f.activeName(),'input');assert.equal(f.menuOpen(),true);
});

test('initial shell entry still focuses its heading when focus remains outside the dialog', () => {
  const f = focusPorts(); shellEffect('focus')(f.scope)(); f.runFrames();
  assert.equal(f.activeName(), 'heading');
});

test('deferred shell focus respects a deliberately focused current dialog button', () => {
  const f = focusPorts(); shellEffect('focus')(f.scope)(); f.close.focus(); f.runFrames();
  assert.equal(f.activeName(), 'close');
});

test('retired shell focus is cancelled and cannot steal restored focus even if its frame is delivered', () => {
  const f = focusPorts(), cleanup = shellEffect('focus')(f.scope)() as (() => void) | undefined;
  cleanup?.(); f.trigger.focus();
  assert.equal(f.cancelledFrames(), 1);
  f.runFrames(true); assert.equal(f.activeName(), 'trigger');
});

test('an old shell frame cannot retarget the heading of a replacement dialog', () => {
  const f = focusPorts(); shellEffect('focus')(f.scope)();
  f.scope.dialogRef.current = new f.ElementPort('replacement-dialog');
  f.scope.titleRef.current = new f.ElementPort('replacement-heading');
  f.runFrames(); assert.equal(f.activeName(), 'trigger');
});

test('a closed shell schedules no heading focus', () => {
  const f = focusPorts(); f.scope.open = false; shellEffect('focus')(f.scope)();
  assert.equal(f.frameCount(), 0); assert.equal(f.activeName(), 'trigger');
});

test('shell Tab wrapping, guarded Escape, scroll lock and return focus keep their actual behavior', () => {
  const f = focusPorts(), cleanup = shellEffect('trap')(f.scope)() as () => void;
  assert.equal(f.scope.document.body.style.overflow, 'hidden');
  f.close.focus(); assert.equal(f.key('Tab', true), true); assert.equal(f.activeName(), 'footer');
  assert.equal(f.key('Tab'), true); assert.equal(f.activeName(), 'close');
  assert.equal(f.key('Escape'), true); assert.equal(f.dismissals(), 1);
  f.scope.loadingRef.current = true; assert.equal(f.key('Escape'), true); assert.equal(f.dismissals(), 1);
  cleanup(); assert.equal(f.scope.document.body.style.overflow, 'auto');
  assert.equal(f.activeName(), 'trigger'); assert.equal(f.listenerCount(), 0);
});

test('actual autocomplete blur still closes its menu when focus leaves its root', () => {
  const f = focusPorts(); f.enterQuery(); f.trigger.focus(); f.runTimers();
  assert.equal(f.menuOpen(), false);
});

test('actual autocomplete keeps its menu while focus moves to an option inside its root', () => {
  const f = focusPorts(), option = new f.ElementPort('option'); option.parent = f.root;
  f.enterQuery(); option.focus(); f.runTimers(); assert.equal(f.menuOpen(), true);
});

test('actual single-area semantic loop waits for the accepted shortlist state before its next click', async () => {
  const text = readFileSync(new URL('./core-journey-app-browser.test.ts', import.meta.url), 'utf8');
  const start = text.indexOf("for (const [area,names] of [['Japan'"); assert.ok(start >= 0);
  const tree = ts.createSourceFile('actual-browser.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let loop: ts.ForOfStatement | undefined;
  function visit(node: ts.Node) {
    if (node.pos >= start && ts.isForOfStatement(node) && node.expression.getText(tree) === 'names'
      && node.getText(tree).includes('Add to shortlist:')) loop ??= node;
    ts.forEachChild(node, visit);
  }
  visit(tree); assert.ok(loop, 'The actual single-area selection loop must exist');
  const calls: string[] = [], accepted = new Map<string, { promise: Promise<void>; release: () => void; selected: boolean }>();
  for (const name of ['Seoul', 'Busan']) {
    let done!: () => void; const row = { promise: new Promise<void>(resolve => { done = resolve; }), release: () => {}, selected: false };
    row.release = () => { row.selected = true; done(); }; accepted.set(name, row);
  }
  const dialog = { getByRole: (_role: string, options: { name: string }) => {
    const name = options.name.split(': ')[1]!;
    return { click: async () => { calls.push(name); }, waitFor: () => accepted.get(name)!.promise,
      getAttribute: async () => String(accepted.get(name)!.selected) };
  } };
  const js = ts.transpileModule(loop.getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const run = new Function('scope', `with(scope){return (async()=>{${js}})();}`)({ dialog, names: ['Seoul', 'Busan'], assert }) as Promise<void>;
  await new Promise<void>(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['Seoul']);
  accepted.get('Seoul')!.release(); await new Promise<void>(resolve => setImmediate(resolve)); assert.deepEqual(calls, ['Seoul', 'Busan']);
  accepted.get('Busan')!.release(); await run;
});
