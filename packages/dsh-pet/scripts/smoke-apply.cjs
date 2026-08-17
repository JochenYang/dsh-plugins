
global.window = { __ModuleLoader__: { load: (h) => { globalThis.__factory = h.factory } } };
const reactStub = { createElement: () => ({}), useCallback: (f) => f, useEffect: () => {}, useRef: (v) => ({ current: v }), useState: (v) => [v, () => {}] };
const requireStub = (spec) => {
  if (spec === 'react') return reactStub;
  if (spec === 'react/jsx-runtime') return { jsx: () => ({}), jsxs: () => ({}) };
  throw new Error('unexpected require: ' + spec);
};
require('D:/codes/dsh-configure/dsh-pet/lib/client.js');
const mod = globalThis.__factory(requireStub);

const calls = [];
let settingsSnapshot = { status: 'ready', value: { reactions: { streaming: true, complete: true, error: true, sentiment: true } } };
const scope = {
  getSnapshot: () => settingsSnapshot,
  subscribe: () => () => {},
  set: async (field, value) => { calls.push('set:' + field); },
};
const ctx = {
  logger: undefined,
  effect: (fn, name) => { calls.push('effect:' + name); return fn(); },
  settingsScope: { bind: (spec) => { calls.push('bind:' + spec.namespace); return scope; } },
  slots: { register: (opts, comp) => { calls.push('register:' + opts.name + ':' + opts.id + ':' + typeof comp); return () => { calls.push('dispose:' + opts.id); }; } },
  sessions: {
    list: { getSnapshot: () => ({ current: undefined, ids: [] }), subscribe: (fn) => () => { calls.push('list-unsub'); } },
    binding: () => undefined,
    scope: () => undefined,
    scopeOf: () => undefined,
    sessionOf: () => undefined,
    open: () => {}, clear: () => {}, search: async () => ({ result: { ok: true, value: { items: [], hasMore: false } } }),
    fork: async () => '', openSubagent: () => {}, subagentAddress: () => undefined, setSubagentCatalogOpen: () => {},
    refreshSubagents: async () => {}, noteAgentPreset: () => {}, provide: () => () => {},
    currentProvideInfo: { getSnapshot: () => null, subscribe: () => () => {} }, searchResultLimit: 20,
  },
};
mod.apply(ctx);
console.log('CALLS:', calls.join(' | '));
const expected = ['bind:pet', 'register:shell.overlay:dsh-pet:function', 'register:settings.section:pet:function'];
for (const e of expected) {
  if (!calls.includes(e)) { console.error('MISSING: ' + e); process.exit(1); }
}
// dispose 路径：effect 返回的 disposer 应可调用
console.log('APPLY OK');
