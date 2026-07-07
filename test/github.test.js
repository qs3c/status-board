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

test('sync merges local + remote and writes once on success', async () => {
  const local = store.setEntry(store.emptyData(), '2026-07-07', 'good', '', new Date('2026-07-07T10:00:00Z'));
  const remote = store.setEntry(store.emptyData(), '2026-07-06', 'not_well', '', new Date('2026-07-06T10:00:00Z'));
  let puts = 0;
  let putSha = null;
  const deps = {
    getRemote: async () => ({ data: remote, sha: 'sha1' }),
    putRemote: async (d, sha) => { puts++; putSha = sha; }
  };
  const merged = await github.sync(deps, local);
  assert.strictEqual(puts, 1);
  assert.strictEqual(putSha, 'sha1');
  assert.strictEqual(merged.entries['2026-07-06'].level, 'not_well');
  assert.strictEqual(merged.entries['2026-07-07'].level, 'good');
});

test('sync retries after a 409 conflict, re-merges fresh remote, then succeeds', async () => {
  const local = store.setEntry(store.emptyData(), '2026-07-07', 'good', '', new Date('2026-07-07T10:00:00Z'));
  let gets = 0;
  let puts = 0;
  const remotes = [
    { data: store.emptyData(), sha: 'stale' },
    { data: store.setEntry(store.emptyData(), '2026-07-05', 'good', '', new Date('2026-07-05T10:00:00Z')), sha: 'fresh' }
  ];
  const deps = {
    getRemote: async () => remotes[gets++],
    putRemote: async (d, sha) => {
      puts++;
      if (sha === 'stale') {
        const e = new Error('conflict');
        e.status = 409;
        throw e;
      }
    }
  };
  const merged = await github.sync(deps, local);
  assert.strictEqual(gets, 2);
  assert.strictEqual(puts, 2);
  assert.strictEqual(merged.entries['2026-07-05'].level, 'good');
  assert.strictEqual(merged.entries['2026-07-07'].level, 'good');
});

test('sync gives up after max retries and rejects', async () => {
  const deps = {
    getRemote: async () => ({ data: store.emptyData(), sha: 'always-stale' }),
    putRemote: async () => {
      const e = new Error('conflict');
      e.status = 409;
      throw e;
    }
  };
  await assert.rejects(() => github.sync(deps, store.emptyData()), /conflict/);
});

test('getRemote fetches GitHub content and decodes status data', async () => {
  const data = store.setEntry(store.emptyData(), '2026-07-07', 'very_good', 'remote', new Date('2026-07-07T10:00:00Z'));
  const originalFetch = global.fetch;
  let seenUrl = '';
  let seenOptions = null;
  global.fetch = async (url, options) => {
    seenUrl = url;
    seenOptions = options;
    return {
      ok: true,
      status: 200,
      json: async () => ({ content: github.encodeContent(data), sha: 'remote-sha' })
    };
  };

  try {
    const result = await github.getRemote({
      token: 'token-1',
      owner: 'octo',
      repo: 'status-data',
      branch: 'main',
      path: 'folder/status.json'
    });
    assert.strictEqual(seenUrl, 'https://api.github.com/repos/octo/status-data/contents/folder/status.json?ref=main');
    assert.strictEqual(seenOptions.headers.Authorization, 'Bearer token-1');
    assert.deepStrictEqual(result, { data, sha: 'remote-sha' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('getRemote returns empty data when the file does not exist yet', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 404 });

  try {
    const result = await github.getRemote({ owner: 'octo', repo: 'status-data', branch: 'main', path: 'status.json' });
    assert.deepStrictEqual(result, { data: store.emptyData(), sha: null });
  } finally {
    global.fetch = originalFetch;
  }
});

test('putRemote sends encoded content and surfaces 409 conflicts', async () => {
  const data = store.setEntry(store.emptyData(), '2026-07-07', 'good', 'local', new Date('2026-07-07T10:00:00Z'));
  const originalFetch = global.fetch;
  let body = null;
  global.fetch = async (url, options) => {
    body = JSON.parse(options.body);
    return { ok: false, status: 409 };
  };

  try {
    await assert.rejects(
      () => github.putRemote({ owner: 'octo', repo: 'status-data', branch: 'main', path: 'status.json' }, data, 'old-sha'),
      /conflict/
    );
    assert.deepStrictEqual(github.decodeContent(body.content), data);
    assert.strictEqual(body.sha, 'old-sha');
    assert.strictEqual(body.branch, 'main');
  } finally {
    global.fetch = originalFetch;
  }
});
