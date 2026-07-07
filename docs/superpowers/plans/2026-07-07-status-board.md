# Status Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a buildless, local-first web app that records one daily status (`not_well` / `good` / `very_good`) plus an optional note, renders a GitHub-style blue heatmap, and syncs a single `status.json` through a GitHub repo for multi-device use.

**Architecture:** Plain HTML/CSS/JS, no bundler. Pure logic (data model, per-day merge, base64, sync orchestration) lives in `js/store.js` and `js/github.js` behind a `window.SB` namespace using a UMD wrapper, so the same files load as classic `<script>` tags in the browser (works from `file://`) and as CommonJS modules under Node's built-in test runner. DOM code lives in `js/heatmap.js` and `js/app.js`.

**Tech Stack:** HTML5, CSS (with `prefers-color-scheme` dark mode), vanilla ES5-compatible JS, GitHub Contents REST API, `node --test` for unit tests (Node 18+, no dependencies).

**Spec:** `docs/superpowers/specs/2026-07-07-status-board-design.md`

---

## File structure

```
mood-board/
  package.json          # test script only; no dependencies
  index.html            # page skeleton, loads the 4 scripts in order
  css/styles.css        # layout, blue level colors, light/dark
  js/store.js           # data model + per-day merge (pure; UMD)
  js/github.js          # base64 encode/decode + sync orchestration + fetch adapters (UMD)
  js/heatmap.js         # board rendering (browser DOM)
  js/app.js             # glue: state, storage, editor, submit, settings, sync
  test/store.test.js    # node --test
  test/github.test.js   # node --test
  README.md             # token setup, Pages, usage
  docs/superpowers/...   # spec + this plan (already committed)
```

Load order in `index.html`: `store.js` → `github.js` → `heatmap.js` → `app.js`. `github.js` depends on `store` (via `require` in Node, via `window.SB.store` in the browser), so it must load after `store.js`.

Shared contract (defined in Task 1–4, reused everywhere):
- Data shape: `{ version: 1, entries: { "YYYY-MM-DD": { level, note, updatedAt } } }`
- `level` ∈ `store.LEVELS` = `['not_well','good','very_good']`
- Level colors (single source, in `heatmap.js`): `not_well=#B5D4F4`, `good=#378ADD`, `very_good=#0C447C`
- `github.sync(deps, localData)` where `deps = { getRemote, putRemote }`, `getRemote()→{data,sha}`, `putRemote(data,sha)` resolves on success / throws `{status:409}` on conflict.

---

## Task 1: Test harness + `store.todayKey`

**Files:**
- Create: `E:\fromGithub\mood-board\package.json`
- Create: `E:\fromGithub\mood-board\test\store.test.js`
- Create: `E:\fromGithub\mood-board\js\store.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "status-board",
  "private": true,
  "version": "1.0.0",
  "description": "Local-first daily status tracker synced through a GitHub repo",
  "scripts": {
    "test": "node --test test/"
  }
}
```

- [ ] **Step 2: Write the failing test** — `test/store.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const store = require('../js/store.js');

test('todayKey formats a local date as YYYY-MM-DD', () => {
  const d = new Date(2026, 6, 7, 15, 0, 0); // 2026-07-07 local time
  assert.strictEqual(store.todayKey(d), '2026-07-07');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/store.test.js`
Expected: FAIL — cannot find module `../js/store.js`.

- [ ] **Step 4: Implement `js/store.js` with the UMD wrapper and `todayKey`**

```js
;(function (root, factory) {
  var api = factory();
  (root.SB = root.SB || {}).store = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var LEVELS = ['not_well', 'good', 'very_good'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  return { LEVELS: LEVELS, todayKey: todayKey };
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/store.test.js`
Expected: PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add package.json test/store.test.js js/store.js
git commit -m "feat: test harness + store.todayKey"
```

---

## Task 2: `store` data model — `emptyData`, `setEntry`, `mergeData`

**Files:**
- Modify: `E:\fromGithub\mood-board\js\store.js`
- Modify: `E:\fromGithub\mood-board\test\store.test.js`

- [ ] **Step 1: Add failing tests** — append to `test/store.test.js`

```js
test('setEntry sets level, note, and an ISO updatedAt without mutating input', () => {
  const data = store.emptyData();
  const now = new Date('2026-07-07T12:34:56Z');
  const next = store.setEntry(data, '2026-07-07', 'very_good', 'hi', now);
  assert.deepStrictEqual(next.entries['2026-07-07'], {
    level: 'very_good', note: 'hi', updatedAt: '2026-07-07T12:34:56.000Z'
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
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/store.test.js`
Expected: FAIL — `store.emptyData is not a function`.

- [ ] **Step 3: Implement the functions** — replace the `factory` body in `js/store.js` with:

```js
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var LEVELS = ['not_well', 'good', 'very_good'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayKey(date) {
    var d = date || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function emptyData() {
    return { version: 1, entries: {} };
  }

  function setEntry(data, dateKey, level, note, nowDate) {
    var base = (data && data.entries) ? data : emptyData();
    var entries = Object.assign({}, base.entries);
    entries[dateKey] = {
      level: level,
      note: note || '',
      updatedAt: (nowDate || new Date()).toISOString()
    };
    return { version: 1, entries: entries };
  }

  function mergeData(a, b) {
    var ea = (a && a.entries) || {};
    var eb = (b && b.entries) || {};
    var out = {};
    var k;
    for (k in ea) if (Object.prototype.hasOwnProperty.call(ea, k)) out[k] = ea[k];
    for (k in eb) if (Object.prototype.hasOwnProperty.call(eb, k)) {
      if (!out[k] || (eb[k].updatedAt || '') > (out[k].updatedAt || '')) out[k] = eb[k];
    }
    return { version: 1, entries: out };
  }

  return {
    LEVELS: LEVELS, todayKey: todayKey, emptyData: emptyData,
    setEntry: setEntry, mergeData: mergeData
  };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/store.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add js/store.js test/store.test.js
git commit -m "feat: store data model with per-day merge"
```

---

## Task 3: `github` base64 encode/decode (UTF-8 safe)

**Files:**
- Create: `E:\fromGithub\mood-board\js\github.js`
- Create: `E:\fromGithub\mood-board\test\github.test.js`

- [ ] **Step 1: Write failing tests** — `test/github.test.js`

```js
const test = require('node:test');
const assert = require('node:assert');
const github = require('../js/github.js');
const store = require('../js/store.js');

test('encode/decode round-trips UTF-8 notes (Chinese + emoji)', () => {
  const data = store.setEntry(store.emptyData(), '2026-07-07', 'good', '今天不错 😀', new Date('2026-07-07T00:00:00Z'));
  const b64 = github.encodeContent(data);
  assert.deepStrictEqual(github.decodeContent(b64), data);
});

test('decodeContent tolerates base64 with newlines (GitHub returns wrapped base64)', () => {
  const data = store.emptyData();
  const wrapped = github.encodeContent(data).replace(/(.{4})/g, '$1\n');
  assert.deepStrictEqual(github.decodeContent(wrapped), data);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/github.test.js`
Expected: FAIL — cannot find module `../js/github.js`.

- [ ] **Step 3: Implement `js/github.js`** (encode/decode only for now)

```js
;(function (root, factory) {
  var store = (typeof require !== 'undefined') ? require('./store.js') : (root.SB && root.SB.store);
  var api = factory(store);
  (root.SB = root.SB || {}).github = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis, function (store) {

  function encodeContent(obj) {
    var json = JSON.stringify(obj, null, 2);
    var bytes = new TextEncoder().encode(json);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function decodeContent(base64) {
    var clean = (base64 || '').replace(/\s/g, '');
    var bin = atob(clean);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var json = new TextDecoder().decode(bytes);
    return JSON.parse(json);
  }

  return { encodeContent: encodeContent, decodeContent: decodeContent };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/github.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add js/github.js test/github.test.js
git commit -m "feat: UTF-8 safe base64 encode/decode for github content"
```

---

## Task 4: `github.sync` orchestration with 409 retry

**Files:**
- Modify: `E:\fromGithub\mood-board\js\github.js`
- Modify: `E:\fromGithub\mood-board\test\github.test.js`

- [ ] **Step 1: Add failing tests** — append to `test/github.test.js`

```js
test('sync merges local + remote and writes once on success', async () => {
  const local = store.setEntry(store.emptyData(), '2026-07-07', 'good', '', new Date('2026-07-07T10:00:00Z'));
  const remote = store.setEntry(store.emptyData(), '2026-07-06', 'not_well', '', new Date('2026-07-06T10:00:00Z'));
  let puts = 0, putSha = null;
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
  let gets = 0, puts = 0;
  const remotes = [
    { data: store.emptyData(), sha: 'stale' },
    { data: store.setEntry(store.emptyData(), '2026-07-05', 'good', '', new Date('2026-07-05T10:00:00Z')), sha: 'fresh' }
  ];
  const deps = {
    getRemote: async () => remotes[gets++],
    putRemote: async (d, sha) => { puts++; if (sha === 'stale') { const e = new Error('conflict'); e.status = 409; throw e; } }
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
    putRemote: async () => { const e = new Error('conflict'); e.status = 409; throw e; }
  };
  await assert.rejects(() => github.sync(deps, store.emptyData()), /conflict/);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test test/github.test.js`
Expected: FAIL — `github.sync is not a function`.

- [ ] **Step 3: Add `sync` to `js/github.js`** — inside the factory, before the `return`, add:

```js
  async function sync(deps, localData) {
    var maxRetries = 3;
    for (var attempt = 0; attempt <= maxRetries; attempt++) {
      var remote = await deps.getRemote();
      var merged = store.mergeData(localData, remote.data);
      try {
        await deps.putRemote(merged, remote.sha);
        return merged;
      } catch (err) {
        if (err && err.status === 409 && attempt < maxRetries) {
          localData = merged;
          continue;
        }
        throw err;
      }
    }
  }
```

  And update the `return` to include it:

```js
  return { encodeContent: encodeContent, decodeContent: decodeContent, sync: sync };
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test test/`
Expected: PASS (all store + github tests, 9 total).

- [ ] **Step 5: Commit**

```bash
git add js/github.js test/github.test.js
git commit -m "feat: github.sync with per-day merge and 409 retry"
```

---

## Task 5: `github` fetch adapters + `defaultDeps`

No unit tests (network). Verified manually in Task 9.

**Files:**
- Modify: `E:\fromGithub\mood-board\js\github.js`

- [ ] **Step 1: Add adapters** — inside the factory, before the `return`, add:

```js
  function apiUrl(config) {
    return 'https://api.github.com/repos/' + config.owner + '/' + config.repo +
      '/contents/' + config.path.split('/').map(encodeURIComponent).join('/');
  }

  function headers(config) {
    var h = { 'Accept': 'application/vnd.github+json' };
    if (config.token) h['Authorization'] = 'Bearer ' + config.token;
    return h;
  }

  async function getRemote(config) {
    var url = apiUrl(config) + '?ref=' + encodeURIComponent(config.branch);
    var res = await fetch(url, { headers: headers(config) });
    if (res.status === 404) return { data: store.emptyData(), sha: null };
    if (!res.ok) { var e = new Error('GitHub GET failed: ' + res.status); e.status = res.status; throw e; }
    var json = await res.json();
    return { data: decodeContent(json.content), sha: json.sha };
  }

  async function putRemote(config, data, sha) {
    var body = {
      message: 'update status ' + new Date().toISOString(),
      content: encodeContent(data),
      branch: config.branch
    };
    if (sha) body.sha = sha;
    var res = await fetch(apiUrl(config), {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers(config)),
      body: JSON.stringify(body)
    });
    if (res.status === 409) { var e = new Error('conflict'); e.status = 409; throw e; }
    if (!res.ok) { var e2 = new Error('GitHub PUT failed: ' + res.status); e2.status = res.status; throw e2; }
    var json = await res.json();
    return { sha: json.content && json.content.sha };
  }

  function defaultDeps(config) {
    return {
      getRemote: function () { return getRemote(config); },
      putRemote: function (data, sha) { return putRemote(config, data, sha); }
    };
  }
```

  And update the `return`:

```js
  return {
    encodeContent: encodeContent, decodeContent: decodeContent,
    sync: sync, getRemote: getRemote, putRemote: putRemote, defaultDeps: defaultDeps
  };
```

- [ ] **Step 2: Confirm existing tests still pass**

Run: `node --test test/`
Expected: PASS (9 tests) — adapters are not called by any test, so nothing regresses.

- [ ] **Step 3: Commit**

```bash
git add js/github.js
git commit -m "feat: github fetch adapters and defaultDeps"
```

---

## Task 6: `index.html` + `css/styles.css`

Static structure and styles only — no logic. Verified visually.

**Files:**
- Create: `E:\fromGithub\mood-board\index.html`
- Create: `E:\fromGithub\mood-board\css\styles.css`

- [ ] **Step 1: Create `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Status Board</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <main class="wrap">
    <section class="card">
      <div class="row between">
        <h1 id="editor-title">Today's status</h1>
        <button id="today-btn" class="link" hidden>Back to today</button>
      </div>
      <div class="levels" id="levels"></div>
      <textarea id="note" placeholder="Add a note (optional)"></textarea>
      <div class="row">
        <button id="submit-btn" class="primary">Submit</button>
        <span id="sync-status" class="muted"></span>
      </div>
    </section>

    <section class="card">
      <div class="row between">
        <h2>This year</h2>
        <span id="count" class="muted"></span>
      </div>
      <div id="heatmap" class="heatmap"></div>
      <div class="legend" id="legend"></div>
    </section>

    <section class="card">
      <div class="row between">
        <h2>Settings</h2>
        <button id="settings-toggle" class="link">Show</button>
      </div>
      <form id="settings-form" hidden>
        <label>GitHub token<input type="password" id="cfg-token" autocomplete="off"></label>
        <label>Owner<input type="text" id="cfg-owner" placeholder="your-username"></label>
        <label>Repo<input type="text" id="cfg-repo" placeholder="status-data"></label>
        <label>Branch<input type="text" id="cfg-branch" value="main"></label>
        <label>File path<input type="text" id="cfg-path" value="status.json"></label>
        <button type="submit" class="primary">Save settings</button>
        <p class="muted">Stored only in this browser. A new device needs it re-entered.</p>
      </form>
    </section>
  </main>

  <script src="js/store.js"></script>
  <script src="js/github.js"></script>
  <script src="js/heatmap.js"></script>
  <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `css/styles.css`**

```css
:root {
  --bg: #f6f8fa; --card: #ffffff; --text: #1f2328; --muted: #656d76;
  --border: #d0d7de; --empty: #ebedf0; --accent: #0c447c;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117; --card: #161b22; --text: #e6edf3; --muted: #8b949e;
    --border: #30363d; --empty: #21262d; --accent: #378add;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 680px; margin: 0 auto; padding: 24px 16px; }
.card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: 12px; padding: 20px; margin-bottom: 16px;
}
h1 { font-size: 18px; margin: 0; font-weight: 500; }
h2 { font-size: 15px; margin: 0; font-weight: 500; }
.row { display: flex; align-items: center; gap: 10px; }
.row.between { justify-content: space-between; margin-bottom: 14px; }
.muted { color: var(--muted); font-size: 13px; }
.link { background: none; border: none; color: var(--accent); cursor: pointer; font-size: 13px; padding: 0; }

.levels { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
.level {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 12px 8px; border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--text); cursor: pointer; font-size: 14px;
}
.level.selected { border: 2px solid var(--accent); }
.swatch { width: 22px; height: 22px; border-radius: 6px; }

textarea {
  width: 100%; min-height: 64px; resize: vertical; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 8px;
  background: var(--card); color: var(--text); font: inherit; margin-bottom: 12px;
}
button.primary {
  background: var(--accent); color: #fff; border: none;
  padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px;
}

.heatmap { overflow-x: auto; padding-bottom: 6px; }
.weeks { display: flex; gap: 3px; }
.week { display: flex; flex-direction: column; gap: 3px; }
.cell { width: 13px; height: 13px; border-radius: 3px; background: var(--empty); cursor: pointer; }
.cell.future { visibility: hidden; cursor: default; }
.legend { display: flex; align-items: center; gap: 6px; margin-top: 12px; font-size: 12px; color: var(--muted); }
.legend .sw { width: 13px; height: 13px; border-radius: 3px; display: inline-block; }
.legend .sw.empty { background: var(--empty); }

form label { display: block; font-size: 13px; color: var(--muted); margin-bottom: 10px; }
form input { display: block; width: 100%; margin-top: 4px; padding: 8px 10px;
  border: 1px solid var(--border); border-radius: 8px; background: var(--card); color: var(--text); font: inherit; }
```

- [ ] **Step 3: Verify it opens**

Open `E:\fromGithub\mood-board\index.html` in a browser. Expected: three empty cards render (status, this year, settings). No JS errors yet expected beyond `SB.heatmap`/`SB.app` not doing anything — that is fine, they arrive in Tasks 7–8. The page must not be blank.

- [ ] **Step 4: Commit**

```bash
git add index.html css/styles.css
git commit -m "feat: page skeleton and styles"
```

---

## Task 7: `js/heatmap.js` — board rendering

Browser DOM. Verified visually.

**Files:**
- Create: `E:\fromGithub\mood-board\js\heatmap.js`

- [ ] **Step 1: Create `js/heatmap.js`**

```js
;(function (root) {
  var COLORS = { not_well: '#B5D4F4', good: '#378ADD', very_good: '#0C447C' };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function keyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  function render(container, data, onCellClick) {
    container.innerHTML = '';
    var entries = (data && data.entries) || {};
    var today = new Date(); today.setHours(0, 0, 0, 0);

    var start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay()); // align back to Sunday

    var weeks = document.createElement('div');
    weeks.className = 'weeks';
    var cursor = new Date(start);

    while (cursor <= today) {
      var col = document.createElement('div');
      col.className = 'week';
      for (var d = 0; d < 7; d++) {
        var cell = document.createElement('div');
        cell.className = 'cell';
        if (cursor <= today) {
          var k = keyOf(cursor);
          var entry = entries[k];
          if (entry && COLORS[entry.level]) cell.style.background = COLORS[entry.level];
          cell.title = k + (entry ? ' · ' + entry.level : '');
          (function (key) {
            cell.addEventListener('click', function () { onCellClick(key); });
          })(k);
        } else {
          cell.className = 'cell future';
        }
        col.appendChild(cell);
        cursor.setDate(cursor.getDate() + 1);
      }
      weeks.appendChild(col);
    }
    container.appendChild(weeks);
  }

  (root.SB = root.SB || {}).heatmap = { render: render, COLORS: COLORS };
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 2: Temporary manual render check**

In the browser console on `index.html`, run:

```js
SB.heatmap.render(
  document.getElementById('heatmap'),
  { version: 1, entries: { '2026-07-06': { level: 'good' }, '2026-07-07': { level: 'very_good' } } },
  function (k) { console.log('clicked', k); }
);
```

Expected: a grid of ~53 week-columns appears; two cells are blue (mid + dark); clicking any cell logs its date. Future cells after today are hidden.

- [ ] **Step 3: Commit**

```bash
git add js/heatmap.js
git commit -m "feat: heatmap board rendering"
```

---

## Task 8: `js/app.js` — state, storage, editor, submit, settings, sync

Browser glue. Verified in Task 9.

**Files:**
- Create: `E:\fromGithub\mood-board\js\app.js`

- [ ] **Step 1: Create `js/app.js`**

```js
;(function () {
  var store = window.SB.store, github = window.SB.github, heatmap = window.SB.heatmap;
  var DATA_KEY = 'statusboard.data', CFG_KEY = 'statusboard.config';
  var LABELS = { not_well: 'Not well', good: 'Good', very_good: 'Very good' };

  function loadData() {
    try { var raw = localStorage.getItem(DATA_KEY); return raw ? JSON.parse(raw) : store.emptyData(); }
    catch (e) { return store.emptyData(); }
  }
  function saveData() { localStorage.setItem(DATA_KEY, JSON.stringify(state.data)); }
  function loadConfig() {
    try { var raw = localStorage.getItem(CFG_KEY); return raw ? JSON.parse(raw) : { branch: 'main', path: 'status.json' }; }
    catch (e) { return { branch: 'main', path: 'status.json' }; }
  }
  function saveConfig() { localStorage.setItem(CFG_KEY, JSON.stringify(state.config)); }

  var state = { data: loadData(), config: loadConfig(), selectedDate: store.todayKey(), pendingLevel: null };

  function setSync(msg) { document.getElementById('sync-status').textContent = msg; }
  function hasConfig() { var c = state.config; return !!(c && c.owner && c.repo && c.path && c.token); }

  function renderLevels() {
    var wrap = document.getElementById('levels'); wrap.innerHTML = '';
    var current = (state.data.entries[state.selectedDate] || {}).level;
    var chosen = state.pendingLevel || current;
    store.LEVELS.forEach(function (lvl) {
      var btn = document.createElement('button');
      btn.className = 'level' + (chosen === lvl ? ' selected' : '');
      var sw = document.createElement('span');
      sw.className = 'swatch'; sw.style.background = heatmap.COLORS[lvl];
      var label = document.createElement('span'); label.textContent = LABELS[lvl];
      btn.appendChild(sw); btn.appendChild(label);
      btn.addEventListener('click', function () { state.pendingLevel = lvl; renderLevels(); });
      wrap.appendChild(btn);
    });
  }

  function renderEditor() {
    var isToday = state.selectedDate === store.todayKey();
    document.getElementById('editor-title').textContent = isToday ? "Today's status" : 'Editing ' + state.selectedDate;
    document.getElementById('today-btn').hidden = isToday;
    document.getElementById('note').value = (state.data.entries[state.selectedDate] || {}).note || '';
    state.pendingLevel = null;
    renderLevels();
  }

  function renderBoard() {
    heatmap.render(document.getElementById('heatmap'), state.data, function (key) {
      state.selectedDate = key; renderEditor();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('count').textContent = Object.keys(state.data.entries).length + ' days recorded';
  }

  function renderLegend() {
    var el = document.getElementById('legend');
    el.innerHTML = '';
    function sw(color, empty) {
      var s = document.createElement('span'); s.className = 'sw' + (empty ? ' empty' : '');
      if (color) s.style.background = color; return s;
    }
    el.appendChild(document.createTextNode('Not well '));
    el.appendChild(sw(heatmap.COLORS.not_well));
    el.appendChild(sw(heatmap.COLORS.good));
    el.appendChild(sw(heatmap.COLORS.very_good));
    el.appendChild(document.createTextNode(' Very good    '));
    el.appendChild(sw(null, true));
    el.appendChild(document.createTextNode(' No record'));
  }

  function submit() {
    var level = state.pendingLevel || (state.data.entries[state.selectedDate] || {}).level;
    if (!level) { setSync('Pick a status first.'); return; }
    var note = document.getElementById('note').value;
    state.data = store.setEntry(state.data, state.selectedDate, level, note, new Date());
    saveData();
    renderBoard();
    renderEditor();
    syncNow();
  }

  function syncNow() {
    if (!hasConfig()) { setSync('Saved locally. Configure GitHub in Settings to sync.'); return; }
    setSync('Syncing…');
    var deps = github.defaultDeps(state.config);
    github.sync(deps, state.data).then(function (merged) {
      state.data = merged; saveData(); renderBoard();
      setSync('Synced to GitHub · ' + new Date().toLocaleTimeString());
    }).catch(function (e) {
      setSync('Sync failed: ' + (e && e.message ? e.message : 'unknown') + ' (saved locally)');
    });
  }

  function fillSettings() {
    var c = state.config;
    document.getElementById('cfg-token').value = c.token || '';
    document.getElementById('cfg-owner').value = c.owner || '';
    document.getElementById('cfg-repo').value = c.repo || '';
    document.getElementById('cfg-branch').value = c.branch || 'main';
    document.getElementById('cfg-path').value = c.path || 'status.json';
  }

  function wire() {
    document.getElementById('submit-btn').addEventListener('click', submit);
    document.getElementById('today-btn').addEventListener('click', function () {
      state.selectedDate = store.todayKey(); renderEditor();
    });
    document.getElementById('settings-toggle').addEventListener('click', function () {
      var f = document.getElementById('settings-form');
      f.hidden = !f.hidden;
      this.textContent = f.hidden ? 'Show' : 'Hide';
    });
    document.getElementById('settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      state.config = {
        token: document.getElementById('cfg-token').value.trim(),
        owner: document.getElementById('cfg-owner').value.trim(),
        repo: document.getElementById('cfg-repo').value.trim(),
        branch: document.getElementById('cfg-branch').value.trim() || 'main',
        path: document.getElementById('cfg-path').value.trim() || 'status.json'
      };
      saveConfig();
      setSync('Settings saved.');
      syncNow();
    });
  }

  fillSettings();
  renderEditor();
  renderBoard();
  renderLegend();
  wire();
  if (hasConfig()) syncNow();
})();
```

- [ ] **Step 2: Manual smoke test (local only, no GitHub)**

Open `index.html`. Expected:
- "Today's status" with three level buttons; clicking one adds the `selected` border.
- Type a note, click Submit → sync line reads "Saved locally. Configure GitHub in Settings to sync.", today's heatmap cell turns blue, count shows "1 days recorded".
- Reload the page → the entry persists (localStorage).
- Click a past cell → editor title changes to "Editing YYYY-MM-DD", "Back to today" appears; set a level and Submit → that cell colors; "Back to today" returns to today.

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: app glue — editor, submit, settings, sync"
```

---

## Task 9: README + full verification

**Files:**
- Create: `E:\fromGithub\mood-board\README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
# Status Board

A tiny local-first web app to record your daily status (Not well / Good / Very good)
with an optional note, shown as a GitHub-style blue heatmap. Data lives in a single
`status.json` file in a GitHub repo so it syncs across devices.

## Use it

Open `index.html` in a browser — that's the whole app. It works offline; records are
saved in the browser. To sync across devices, configure GitHub in Settings.

## Set up sync

1. Create a repo to hold your data (public or private — your choice), e.g. `status-data`.
2. Create a GitHub **fine-grained personal access token**:
   - Repository access: only that one repo.
   - Permissions: **Contents → Read and write**.
3. In the app, open **Settings** and fill in:
   - GitHub token, Owner (your username), Repo, Branch (`main`), File path (`status.json`).
4. Click **Save settings**. The app creates/updates `status.json` on submit and merges
   changes from other devices per day (newest edit of a day wins).

The token is stored only in this browser on this device. A new device needs it re-entered.

## Optional: host it

Push these files to a repo and enable **GitHub Pages**, then open the Pages URL on any
device (including your phone).

## Develop

```bash
node --test test/     # run unit tests (Node 18+, no dependencies)
```
````

- [ ] **Step 2: Run the full test suite**

Run: `node --test test/`
Expected: PASS — all store + github tests (9 total), 0 failures.

- [ ] **Step 3: Full manual verification against the spec**

Open `index.html` and confirm:
- One status per day; submitting again overwrites today (spec: A).
- Clicking a past cell backfills/edits that day (spec: B).
- Heatmap colors: Not well = light blue, Good = mid blue, Very good = dark blue, no record = gray (spec: UI).
- With Settings configured against a test repo: submit writes `status.json` to GitHub (check the repo); editing on a second browser/profile and reloading the first merges both days (spec: sync). Simulate a private and a public repo to confirm both work.
- Dark mode: switch OS/browser to dark and confirm the page is readable.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: README with sync setup and usage"
```

---

## Self-review notes

- Spec coverage: three levels + note + submit (Tasks 6, 8); overwrite today + backfill past days (Task 8); blue heatmap with no-record gray (Tasks 6, 7); local-first localStorage (Task 8); per-day merge + 409 retry (Tasks 2, 4); public/private repos via token config (Tasks 5, 8, 9); token stored locally with warning (Tasks 6, 9); `status.json` default path (Tasks 6, 8). All covered.
- Naming consistency: `store.LEVELS/todayKey/emptyData/setEntry/mergeData`, `github.encodeContent/decodeContent/sync/getRemote/putRemote/defaultDeps`, `heatmap.render/COLORS`, and the `{getRemote,putRemote}` deps contract are used identically across tasks.
- Level colors are defined once in `heatmap.js` and consumed by `app.js` (`heatmap.COLORS`) to avoid drift.
```
