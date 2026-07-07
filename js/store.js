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

  function emptyData() {
    return { version: 1, entries: {} };
  }

  function setEntry(data, dateKey, level, note, nowDate) {
    var base = data && data.entries ? data : emptyData();
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

    for (k in ea) {
      if (Object.prototype.hasOwnProperty.call(ea, k)) out[k] = ea[k];
    }

    for (k in eb) {
      if (Object.prototype.hasOwnProperty.call(eb, k)) {
        if (!out[k] || (eb[k].updatedAt || '') > (out[k].updatedAt || '')) out[k] = eb[k];
      }
    }

    return { version: 1, entries: out };
  }

  return {
    LEVELS: LEVELS,
    todayKey: todayKey,
    emptyData: emptyData,
    setEntry: setEntry,
    mergeData: mergeData
  };
});
