;(function (root) {
  var COLORS = { not_well: '#B5D4F4', good: '#378ADD', very_good: '#0C447C' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEKDAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];

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

    var grid = document.createElement('div');
    grid.className = 'heatmap-grid';

    var months = document.createElement('div');
    months.className = 'month-labels';

    var weekdays = document.createElement('div');
    weekdays.className = 'weekday-labels';
    for (var i = 0; i < WEEKDAY_LABELS.length; i++) {
      var label = document.createElement('span');
      label.className = 'weekday-label';
      label.textContent = WEEKDAY_LABELS[i];
      weekdays.appendChild(label);
    }

    var weeks = document.createElement('div');
    weeks.className = 'weeks';
    var cursor = new Date(start);
    var weekIndex = 0;

    while (cursor <= today) {
      if (weekIndex === 0 || cursor.getDate() <= 7) {
        var month = document.createElement('span');
        month.className = 'month-label';
        month.textContent = MONTHS[cursor.getMonth()];
        month.style.gridColumn = (weekIndex + 1) + ' / span 4';
        months.appendChild(month);
      }

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
      weekIndex++;
    }

    grid.style.setProperty('--week-count', weekIndex);
    grid.appendChild(months);
    grid.appendChild(weekdays);
    grid.appendChild(weeks);
    container.appendChild(grid);
  }

  (root.SB = root.SB || {}).heatmap = { render: render, COLORS: COLORS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.SB.heatmap;
})(typeof window !== 'undefined' ? window : globalThis);
