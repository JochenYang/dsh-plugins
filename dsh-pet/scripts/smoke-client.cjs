
global.window = {
  __ModuleLoader__: {
    load: (handoff) => { console.log('registered:', handoff.id); globalThis.__factory = handoff.factory }
  }
};
const reactStub = {
  createElement: () => ({ __el: true }),
  useCallback: (f) => f,
  useEffect: () => {},
  useRef: (v) => ({ current: v }),
  useState: (v) => [v, () => {}],
};
const requireStub = (spec) => {
  if (spec === 'react') return reactStub;
  if (spec === 'react/jsx-runtime') return { jsx: () => ({ __el: true }), jsxs: () => ({ __el: true }) };
  throw new Error('unexpected require: ' + spec);
};
require('D:/codes/dsh-configure/dsh-pet/lib/client.js');
const mod = globalThis.__factory(requireStub);
console.log('exports:', Object.keys(mod).join(', '));
console.log('inject:', JSON.stringify(mod.inject));
console.log('apply:', typeof mod.apply);
if (typeof mod.apply !== 'function') process.exit(1);
console.log('SMOKE OK');
