;(function (root) {
  var COLORS = { not_well: '#B5D4F4', good: '#378ADD', very_good: '#0C447C' };

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function keyOf(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function render(container, data, onCellClick) {
    container.innerHTML = '';
    var entries = (data && data.entries) || {};
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    var start = new Date(today);
    start.setDate(start.getDate() - 364);
    start.setDate(start.getDate() - start.getDay());

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
          cell.title = k + (entry ? ' - ' + entry.level : '');
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
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SB.heatmap;
})(typeof window !== 'undefined' ? window : globalThis);
