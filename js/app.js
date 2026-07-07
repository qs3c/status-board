;(function () {
  var store = window.SB.store;
  var github = window.SB.github;
  var heatmap = window.SB.heatmap;
  var DATA_KEY = 'statusboard.data';
  var CFG_KEY = 'statusboard.config';
  var LABELS = { not_well: 'Not well', good: 'Good', very_good: 'Very good' };

  function loadData() {
    try {
      var raw = localStorage.getItem(DATA_KEY);
      return raw ? JSON.parse(raw) : store.emptyData();
    } catch (e) {
      return store.emptyData();
    }
  }

  function saveData() {
    localStorage.setItem(DATA_KEY, JSON.stringify(state.data));
  }

  function loadConfig() {
    try {
      var raw = localStorage.getItem(CFG_KEY);
      return raw ? JSON.parse(raw) : { branch: 'main', path: 'status.json' };
    } catch (e) {
      return { branch: 'main', path: 'status.json' };
    }
  }

  function saveConfig() {
    localStorage.setItem(CFG_KEY, JSON.stringify(state.config));
  }

  var state = {
    data: loadData(),
    config: loadConfig(),
    selectedDate: store.todayKey(),
    pendingLevel: null
  };

  function setSync(msg) {
    document.getElementById('sync-status').textContent = msg;
  }

  function hasConfig() {
    var c = state.config;
    return !!(c && c.owner && c.repo && c.path && c.token);
  }

  function renderLevels() {
    var wrap = document.getElementById('levels');
    wrap.innerHTML = '';
    var current = (state.data.entries[state.selectedDate] || {}).level;
    var chosen = state.pendingLevel || current;

    store.LEVELS.forEach(function (level) {
      var btn = document.createElement('button');
      btn.className = 'level' + (chosen === level ? ' selected' : '');

      var swatch = document.createElement('span');
      swatch.className = 'swatch';
      swatch.style.background = heatmap.COLORS[level];

      var label = document.createElement('span');
      label.textContent = LABELS[level];

      btn.appendChild(swatch);
      btn.appendChild(label);
      btn.addEventListener('click', function () {
        state.pendingLevel = level;
        renderLevels();
      });
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
      state.selectedDate = key;
      renderEditor();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    document.getElementById('count').textContent = Object.keys(state.data.entries).length + ' days recorded';
  }

  function renderLegend() {
    var el = document.getElementById('legend');
    el.innerHTML = '';

    function swatch(color, empty) {
      var s = document.createElement('span');
      s.className = 'sw' + (empty ? ' empty' : '');
      if (color) s.style.background = color;
      return s;
    }

    el.appendChild(document.createTextNode('Not well '));
    el.appendChild(swatch(heatmap.COLORS.not_well));
    el.appendChild(swatch(heatmap.COLORS.good));
    el.appendChild(swatch(heatmap.COLORS.very_good));
    el.appendChild(document.createTextNode(' Very good  '));
    el.appendChild(swatch(null, true));
    el.appendChild(document.createTextNode(' No record'));
  }

  function submit() {
    var existing = state.data.entries[state.selectedDate] || {};
    var level = state.pendingLevel || existing.level;
    if (!level) {
      setSync('Pick a status first.');
      return;
    }

    var note = document.getElementById('note').value;
    state.data = store.setEntry(state.data, state.selectedDate, level, note, new Date());
    saveData();
    renderBoard();
    renderEditor();
    syncNow();
  }

  function syncNow() {
    if (!hasConfig()) {
      setSync('Saved locally. Configure GitHub in Settings to sync.');
      return;
    }

    setSync('Syncing...');
    var deps = github.defaultDeps(state.config);
    github.sync(deps, state.data).then(function (merged) {
      state.data = merged;
      saveData();
      renderBoard();
      setSync('Synced to GitHub - ' + new Date().toLocaleTimeString());
    }).catch(function (err) {
      setSync('Sync failed: ' + (err && err.message ? err.message : 'unknown') + ' (saved locally)');
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
      state.selectedDate = store.todayKey();
      renderEditor();
    });
    document.getElementById('settings-toggle').addEventListener('click', function () {
      var form = document.getElementById('settings-form');
      form.hidden = !form.hidden;
      this.textContent = form.hidden ? 'Show' : 'Hide';
    });
    document.getElementById('settings-form').addEventListener('submit', function (event) {
      event.preventDefault();
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
