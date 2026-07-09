const test = require('node:test');
const assert = require('node:assert');
const store = require('../js/store.js');

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.style = {};
    this.hidden = false;
    this.value = '';
    this.textContent = '';
    this.listeners = {};
    this._innerHTML = '';
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(event, handler) {
    this.listeners[event] = handler;
  }

  click() {
    if (this.listeners.click) this.listeners.click.call(this, { preventDefault() {} });
  }

  submit() {
    if (this.listeners.submit) this.listeners.submit.call(this, { preventDefault() {} });
  }

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function setupDom() {
  const ids = [
    'editor-title', 'today-btn', 'levels', 'note', 'submit-btn', 'sync-status',
    'heatmap', 'count', 'legend', 'settings-toggle', 'settings-form',
    'cfg-token', 'cfg-owner', 'cfg-repo', 'cfg-branch', 'cfg-path'
  ];
  const elements = {};
  ids.forEach((id) => { elements[id] = new FakeElement('div'); });
  elements['cfg-branch'].value = 'main';
  elements['cfg-path'].value = 'status.json';

  global.document = {
    getElementById: (id) => elements[id],
    createElement: (tag) => new FakeElement(tag),
    createTextNode: (text) => {
      const node = new FakeElement('#text');
      node.textContent = text;
      return node;
    }
  };

  const storage = {};
  global.localStorage = {
    getItem: (key) => Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null,
    setItem: (key, value) => { storage[key] = String(value); }
  };

  global.window = {
    SB: {
      store,
      github: {
        defaultDeps: () => ({ getRemote: async () => ({ data: store.emptyData(), sha: null }), putRemote: async () => {} }),
        sync: async () => store.emptyData()
      },
      heatmap: {
        COLORS: { not_well: '#B5D4F4', good: '#378ADD', very_good: '#0C447C' },
        render: (container, data, onCellClick) => {
          container.data = data;
          container.onCellClick = onCellClick;
        }
      }
    },
    scrollTo() {}
  };

  return { elements, storage };
}

function loadApp() {
  delete require.cache[require.resolve('../js/app.js')];
  require('../js/app.js');
}

test('submitting a selected status saves it locally and renders a local-only sync message', () => {
  const { elements, storage } = setupDom();

  loadApp();

  elements.levels.children[2].click();
  elements.note.value = 'solid day';
  elements['submit-btn'].click();

  const saved = JSON.parse(storage['statusboard.data']);
  const today = store.todayKey();
  assert.deepStrictEqual(saved.entries[today].level, 'very_good');
  assert.deepStrictEqual(saved.entries[today].note, 'solid day');
  assert.strictEqual(elements['sync-status'].textContent, 'Saved locally. Configure GitHub in Settings to sync.');
});

test('submitting unchanged status does not rewrite local data or sync', () => {
  const { elements, storage } = setupDom();
  const today = store.todayKey();
  const existing = store.setEntry(store.emptyData(), today, 'good', 'same note', new Date('2026-07-07T10:00:00Z'));
  let syncs = 0;
  storage['statusboard.data'] = JSON.stringify(existing);
  global.window.SB.github.sync = async () => {
    syncs++;
    return store.emptyData();
  };

  loadApp();

  elements.note.value = 'same note';
  elements['submit-btn'].click();

  assert.deepStrictEqual(JSON.parse(storage['statusboard.data']), existing);
  assert.strictEqual(syncs, 0);
  assert.strictEqual(elements['sync-status'].textContent, 'No changes to save.');
});
