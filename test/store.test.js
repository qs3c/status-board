const test = require('node:test');
const assert = require('node:assert');
const store = require('../js/store.js');

test('todayKey formats a local date as YYYY-MM-DD', () => {
  const d = new Date(2026, 6, 7, 15, 0, 0);
  assert.strictEqual(store.todayKey(d), '2026-07-07');
});
