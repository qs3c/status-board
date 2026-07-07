const test = require('node:test');
const assert = require('node:assert');
const store = require('../js/store.js');

test('todayKey formats a local date as YYYY-MM-DD', () => {
  const d = new Date(2026, 6, 7, 15, 0, 0);
  assert.strictEqual(store.todayKey(d), '2026-07-07');
});

test('setEntry sets level, note, and an ISO updatedAt without mutating input', () => {
  const data = store.emptyData();
  const now = new Date('2026-07-07T12:34:56Z');
  const next = store.setEntry(data, '2026-07-07', 'very_good', 'hi', now);
  assert.deepStrictEqual(next.entries['2026-07-07'], {
    level: 'very_good',
    note: 'hi',
    updatedAt: '2026-07-07T12:34:56.000Z'
  });
  assert.strictEqual(Object.keys(data.entries).length, 0);
});

test('mergeData keeps different days from both sides', () => {
  const a = store.setEntry(store.emptyData(), '2026-07-06', 'good', '', new Date('2026-07-06T10:00:00Z'));
  const b = store.setEntry(store.emptyData(), '2026-07-07', 'not_well', '', new Date('2026-07-07T10:00:00Z'));
  const m = store.mergeData(a, b);
  assert.strictEqual(m.entries['2026-07-06'].level, 'good');
  assert.strictEqual(m.entries['2026-07-07'].level, 'not_well');
});

test('mergeData resolves the same day by newest updatedAt, order-independent', () => {
  const older = store.setEntry(store.emptyData(), '2026-07-07', 'not_well', 'old', new Date('2026-07-07T08:00:00Z'));
  const newer = store.setEntry(store.emptyData(), '2026-07-07', 'very_good', 'new', new Date('2026-07-07T20:00:00Z'));
  assert.strictEqual(store.mergeData(older, newer).entries['2026-07-07'].note, 'new');
  assert.strictEqual(store.mergeData(newer, older).entries['2026-07-07'].note, 'new');
});
