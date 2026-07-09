const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'styles.css'), 'utf8');

function ruleFor(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}', 'm'));
  return match ? match[1] : '';
}

test('layout keeps the yearly heatmap readable without squeezing cells', () => {
  const wrap = ruleFor('.wrap');
  const weeks = ruleFor('.weeks');
  const cell = ruleFor('.cell');

  assert.match(wrap, /max-width:\s*960px/);
  assert.match(weeks, /repeat\(var\(--week-count\),\s*13px\)/);
  assert.match(cell, /width:\s*13px/);
  assert.match(cell, /height:\s*13px/);
});
