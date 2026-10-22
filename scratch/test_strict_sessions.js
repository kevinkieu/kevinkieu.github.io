const vm = require('vm');

const context = {
  window: {},
  console: console
};
context.window = context;

// Define sessions on window with Object.defineProperty
let _sess = [{ id: 's1' }];
Object.defineProperty(context.window, 'sessions', {
  get: () => _sess,
  set: (v) => { _sess = v; }
});

const code = `
(function() {
  'use strict';
  try {
    // Test bare sessions access
    console.log("bare sessions:", typeof sessions);
    console.log("sessions length:", sessions.length);
  } catch (e) {
    console.error("Caught error:", e.name, e.message);
  }
})();
`;

vm.runInNewContext(code, context);
