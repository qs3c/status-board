const test = require('node:test');
const assert = require('node:assert');

class FakeElement {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.className = '';
    this.style = {};
    this.title = '';
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

  set innerHTML(value) {
    this._innerHTML = value;
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML;
  }
}

function todayKey() {
  const d = new Date();
  const pad = (n) => n < 10 ? '0' + n : '' + n;
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function collectByClass(node, className, out = []) {
  if ((node.className || '').split(/\s+/).includes(className)) out.push(node);
  for (const child of node.children || []) collectByClass(child, className, out);
  return out;
}

test('render creates a clickable yearly heatmap with level colors', () => {
  global.document = { createElement: (tag) => new FakeElement(tag) };
  global.SB = {};
  require('../js/heatmap.js');

  const key = todayKey();
  const container = new FakeElement('div');
  let clicked = null;
  global.SB.heatmap.render(
    container,
    { version: 1, entries: { [key]: { level: 'very_good' } } },
    (dateKey) => { clicked = dateKey; }
  );

  const cells = collectByClass(container, 'cell');
  const todayCell = cells.find((cell) => cell.title.startsWith(key));
  assert.ok(cells.length >= 365);
  assert.strictEqual(todayCell.style.background, '#0C447C');

  todayCell.listeners.click();
  assert.strictEqual(clicked, key);
});
