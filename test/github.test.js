const test = require('node:test');
const assert = require('node:assert');
const github = require('../js/github.js');
const store = require('../js/store.js');

test('encode/decode round-trips UTF-8 notes (Chinese + emoji)', () => {
  const data = store.setEntry(store.emptyData(), '2026-07-07', 'good', '今天不错 😄', new Date('2026-07-07T00:00:00Z'));
  const b64 = github.encodeContent(data);
  assert.deepStrictEqual(github.decodeContent(b64), data);
});

test('decodeContent tolerates base64 with newlines (GitHub returns wrapped base64)', () => {
  const data = store.emptyData();
  const wrapped = github.encodeContent(data).replace(/(.{4})/g, '$1\n');
  assert.deepStrictEqual(github.decodeContent(wrapped), data);
});
